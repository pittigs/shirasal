import React, { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import Quill from 'quill';
import { QuillBinding } from 'y-quill';
import { useTranslation } from '../contexts/LanguageContext';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import QuillCursors from 'quill-cursors';
import 'quill/dist/quill.snow.css';

Quill.register('modules/cursors', QuillCursors);

interface DocumentInfo {
  id: string;
  title: string;
  type?: 'text' | 'google_doc';
  externalUrl?: string;
  lastModified: string;
}

interface AttachmentInfo {
  id: string;
  docId: string;
  filename: string;
  filedata: string; // Base64 data URL
  uploadedAt: string;
}

interface WorkspaceProps {
  socket: any;
  userRole: string;
  hasPermission: (permission: 'canManageRoles' | 'canManageChannels' | 'canManageUsers') => boolean;
  localUsername: string;
  userColor: string;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  socket,
  userRole,
  hasPermission,
  localUsername,
  userColor
}) => {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeDocTitle, setActiveDocTitle] = useState<string>('');
  const [activeDocType, setActiveDocType] = useState<'text' | 'google_doc'>('text');
  const [activeDocUrl, setActiveDocUrl] = useState<string>('');
  const [docType, setDocType] = useState<'text' | 'google_doc'>('text');
  const [externalUrl, setExternalUrl] = useState('');
  const [newDocTitle, setNewDocTitle] = useState('');
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<AttachmentInfo | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const bindingRef = useRef<QuillBinding | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);

  // 1. Initial document list load
  useEffect(() => {
    if (!socket) return;

    socket.emit('get-documents');

    const handleDocsList = (list: DocumentInfo[]) => {
      setDocuments(list);
    };

    socket.on('documents-list', handleDocsList);

    return () => {
      socket.off('documents-list', handleDocsList);
    };
  }, [socket]);

  // 2. Setup real-time editor on document activation
  useEffect(() => {
    if (!socket || !activeDocId) return;

    // Clean up previous bindings
    cleanupEditor();

    if (activeDocType === 'google_doc') {
      return;
    }

    // Fetch attachments
    socket.emit('get-attachments', { docId: activeDocId });
    socket.emit('join-document', { docId: activeDocId });

    const handleDocumentInit = (payload: { docId: string; update: ArrayBuffer | Uint8Array }) => {
      if (payload.docId !== activeDocId || !editorContainerRef.current) return;

      // Vorherige Instanzen säubern, um Doppel-Initialisierungen zu vermeiden
      cleanupEditor();

      const ydoc = new Y.Doc();
      ydocRef.current = ydoc;

      if (payload.update) {
        Y.applyUpdate(ydoc, new Uint8Array(payload.update), socket);
      }

      // Initialize Yjs Awareness
      const awareness = new Awareness(ydoc);
      awarenessRef.current = awareness;

      // Set user name and dynamically passed role color
      awareness.setLocalStateField('user', {
        name: localUsername,
        color: userColor
      });

      // Initialize Quill
      const quill = new Quill(editorContainerRef.current, {
        theme: 'snow',
        placeholder: 'Schreibe hier etwas kollaborativ...',
        modules: {
          cursors: true,
          toolbar: [
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            ['blockquote', 'code-block'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            [{ color: [] }, { background: [] }],
            ['clean']
          ]
        }
      });
      quillRef.current = quill;

      // Bind Quill to Yjs and Awareness
      const type = ydoc.getText('content');
      const binding = new QuillBinding(type, quill, awareness);
      bindingRef.current = binding;

      // Listen for local updates to transmit
      ydoc.on('update', (update, origin) => {
        if (origin !== socket) {
          socket.emit('yjs-update', { docId: activeDocId, update });
        }
      });

      // Listen for local awareness updates to transmit
      awareness.on('update', ({ added, updated, removed }: any, origin: any) => {
        if (origin === 'local') {
          const changedClients = added.concat(updated).concat(removed);
          const updateBytes = encodeAwarenessUpdate(awareness, changedClients);
          socket.emit('yjs-awareness-update', { docId: activeDocId, update: Array.from(updateBytes) });
        }
      });

      // Request awareness state from existing clients in this document
      socket.emit('yjs-awareness-request', { docId: activeDocId });
    };

    const handleYjsUpdate = (payload: { docId: string; update: ArrayBuffer | Uint8Array }) => {
      if (payload.docId === activeDocId && ydocRef.current) {
        Y.applyUpdate(ydocRef.current, new Uint8Array(payload.update), socket);
      }
    };

    const handleAwarenessUpdate = (payload: { docId: string; update: number[] | Uint8Array }) => {
      if (payload.docId === activeDocId && awarenessRef.current) {
        applyAwarenessUpdate(awarenessRef.current, new Uint8Array(payload.update), socket);
      }
    };

    const handleAwarenessRequest = (payload: { docId: string }) => {
      if (payload.docId === activeDocId && awarenessRef.current && ydocRef.current) {
        const localUpdate = encodeAwarenessUpdate(awarenessRef.current, [ydocRef.current.clientID]);
        socket.emit('yjs-awareness-update', { docId: activeDocId, update: Array.from(localUpdate) });
      }
    };

    const handleAttachmentsList = (payload: { docId: string; list: AttachmentInfo[] }) => {
      if (payload.docId === activeDocId) {
        setAttachments(payload.list);
      }
    };

    socket.on('document-init', handleDocumentInit);
    socket.on('yjs-update', handleYjsUpdate);
    socket.on('yjs-awareness-update', handleAwarenessUpdate);
    socket.on('yjs-awareness-request', handleAwarenessRequest);
    socket.on('attachments-list', handleAttachmentsList);

    return () => {
      cleanupEditor();
      socket.emit('leave-document');
      socket.off('document-init', handleDocumentInit);
      socket.off('yjs-update', handleYjsUpdate);
      socket.off('yjs-awareness-update', handleAwarenessUpdate);
      socket.off('yjs-awareness-request', handleAwarenessRequest);
      socket.off('attachments-list', handleAttachmentsList);
    };
  }, [socket, activeDocId, activeDocType]);

  const cleanupEditor = () => {
    if (bindingRef.current) {
      bindingRef.current.destroy();
      bindingRef.current = null;
    }
    if (awarenessRef.current) {
      awarenessRef.current.destroy();
      awarenessRef.current = null;
    }
    if (ydocRef.current) {
      ydocRef.current.destroy();
      ydocRef.current = null;
    }
    if (quillRef.current) {
      quillRef.current = null;
    }
    if (editorContainerRef.current) {
      editorContainerRef.current.innerHTML = '';
      // Entferne Quill-Toolbar (Geschwister-Element im DOM)
      const parent = editorContainerRef.current.parentNode;
      if (parent) {
        const toolbars = parent.querySelectorAll('.ql-toolbar');
        toolbars.forEach(tb => tb.remove());
      }
    }
  };

  const handleCreateDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (newDocTitle.trim()) {
      socket.emit('create-document', { 
        title: newDocTitle.trim(),
        type: docType,
        externalUrl: docType === 'google_doc' ? externalUrl.trim() : null
      });
      setNewDocTitle('');
      setExternalUrl('');
      setDocType('text');
      setShowCreateForm(false);
    }
  };

  const handleDeleteDocument = (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasPermission('canManageChannels') && userRole !== 'admin') {
      alert(t('workspace.unauthorized'));
      return;
    }
    if (confirm(t('workspace.delete_doc_confirm'))) {
      socket.emit('delete-document', { docId });
      if (activeDocId === docId) {
        setActiveDocId(null);
        setActiveDocTitle('');
        setActiveDocType('text');
        setActiveDocUrl('');
        setAttachments([]);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeDocId) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result as string;
      socket.emit('upload-attachment', {
        docId: activeDocId,
        filename: file.name,
        filedata: base64Data
      });
      alert(t('workspace.upload_success'));
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteAttachment = (attachmentId: string) => {
    if (confirm('Anhang wirklich löschen?')) {
      socket.emit('delete-attachment', { docId: activeDocId, attachmentId });
    }
  };

  const handleWordImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !quillRef.current) return;

    if (!file.name.toLowerCase().endsWith('.docx')) {
      alert("Es sind nur .docx-Dateien erlaubt.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      try {
        const mammoth = (window as any).mammoth;
        if (!mammoth) {
          alert("Mammoth.js wird noch geladen. Bitte warte einen Moment und versuche es erneut.");
          return;
        }
        const result = await mammoth.convertToHtml({ arrayBuffer });
        const quill = quillRef.current;
        if (quill) {
          quill.clipboard.dangerouslyPasteHTML(0, result.value);
        }
      } catch (err) {
        console.error("Fehler beim Parsen der Word-Datei:", err);
        alert("Fehler beim Importieren der Word-Datei. Bitte stelle sicher, dass es sich um eine gültige .docx-Datei handelt.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleWordExport = () => {
    if (!quillRef.current) return;
    const htmlContent = quillRef.current.root.innerHTML;
    
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' " +
          "xmlns:w='urn:schemas-microsoft-com:office:word' " +
          "xmlns='http://www.w3.org/TR/REC-html40'>" +
          "<head><title>" + activeDocTitle + "</title><style>" +
          "body { font-family: Arial, sans-serif; }" +
          "</style></head><body>";
    const footer = "</body></html>";
    const sourceHTML = header + htmlContent + footer;
    
    const dataType = 'application/msword';
    const blob = new Blob(['\ufeff' + sourceHTML], { type: dataType });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDocTitle || 'Dokument'}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', gap: '20px' }}>
      
      {/* Sidebar: Documents list */}
      <div 
        className="glass-panel" 
        style={{ 
          width: '280px', 
          padding: '16px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '16px',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>{t('workspace.doc_list_title')}</h3>
          <button 
            onClick={() => setShowCreateForm(!showCreateForm)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.2rem',
              cursor: 'pointer',
              color: 'var(--accent-color)'
            }}
            title={t('workspace.new_doc_btn')}
          >
            ➕
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={handleCreateDocument} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as 'text' | 'google_doc')}
              className="input-field"
              style={{ fontSize: '0.8rem', padding: '6px', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px' }}
            >
              <option value="text">📄 Text-Dokument / Word-Import</option>
              <option value="google_doc">🌐 Google Doc verknüpfen</option>
            </select>
            <input 
              type="text" 
              placeholder={docType === 'text' ? t('workspace.new_doc_placeholder') : "Google Doc Name"}
              value={newDocTitle}
              onChange={(e) => setNewDocTitle(e.target.value)}
              className="input-field"
              style={{ fontSize: '0.8rem', padding: '6px 10px' }}
              required
              autoFocus
            />
            {docType === 'google_doc' && (
              <input 
                type="url" 
                placeholder="Google Doc URL (https://docs.google.com/...)"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                className="input-field"
                style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                required
              />
            )}
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', width: 'auto' }}>✓ Erstellen</button>
            </div>
          </form>
        )}

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {documents.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '20px' }}>
              {t('workspace.no_docs')}
            </p>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                onClick={() => {
                  setActiveDocId(doc.id);
                  setActiveDocTitle(doc.title);
                  setActiveDocType(doc.type || 'text');
                  setActiveDocUrl(doc.externalUrl || '');
                }}
                className={`glass-panel ${activeDocId === doc.id ? 'active' : ''}`}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: activeDocId === doc.id ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(255,255,255,0.02)',
                  borderColor: activeDocId === doc.id ? 'var(--accent-color)' : 'rgba(255,255,255,0.05)',
                  transition: 'all 0.2s',
                  borderRadius: '10px'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {doc.type === 'google_doc' ? '🌐' : '📄'} {doc.title}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    {new Date(doc.lastModified).toLocaleDateString()}
                  </span>
                </div>
                {(hasPermission('canManageChannels') || userRole === 'admin') && (
                  <button
                    onClick={(e) => handleDeleteDocument(doc.id, e)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      opacity: 0.6,
                      padding: '4px'
                    }}
                    title="Löschen"
                  >
                    🗑️
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Editor Space */}
      <div 
        className="glass-panel" 
        style={{ 
          flex: 1, 
          padding: '20px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '16px',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}
      >
        {activeDocId ? (
          <>
            {/* Title & Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: '#fff' }}>
                {activeDocType === 'google_doc' ? '🌐' : '📄'} {activeDocTitle}
              </h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {activeDocType === 'text' && (
                  <>
                    <label className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-block' }} title="Lade eine .docx Datei in diesen Editor">
                      Word importieren (.docx) 📥
                      <input type="file" accept=".docx" onChange={handleWordImport} style={{ display: 'none' }} />
                    </label>
                    <button onClick={handleWordExport} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} title="Diesen Text als Word-Datei (.doc) herunterladen">
                      Word exportieren (.doc) 📤
                    </button>
                  </>
                )}
                <label className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-block' }}>
                  {t('workspace.upload_btn')}
                  <input type="file" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
              </div>
            </div>

            {/* Editor or Iframe Container */}
            {activeDocType === 'google_doc' ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <iframe
                  src={activeDocUrl}
                  title={activeDocTitle}
                  style={{
                    flex: 1,
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    borderRadius: '8px',
                    background: '#fff'
                  }}
                  allow="autoplay; encrypted-media"
                />
              </div>
            ) : (
              /* Quill editor container */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div 
                  ref={editorContainerRef} 
                  className="glass-panel" 
                  style={{ 
                    flex: 1, 
                    background: 'rgba(0,0,0,0.15)', 
                    borderColor: 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    borderRadius: '8px',
                    overflowY: 'auto'
                  }}
                />
              </div>
            )}

            {/* Attachments Section */}
            {attachments.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>Dateianhänge</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {attachments.map((file) => (
                    <div 
                      key={file.id} 
                      onClick={() => setPreviewAttachment(file)}
                      style={{
                        padding: '6px 10px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.8rem',
                        transition: 'all 0.2s'
                      }}
                      className="glass-panel"
                    >
                      <span>📎 {file.filename}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAttachment(file.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#f43f5e',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          padding: '2px'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Wähle links ein Dokument aus oder erstelle ein neues, um mit dem Coworking zu beginnen.
          </div>
        )}
      </div>

      {/* Preview Modal for Attachments */}
      {previewAttachment && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.7)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px'
          }}
          onClick={() => setPreviewAttachment(null)}
        >
          <div 
            className="glass-panel" 
            style={{ 
              maxWidth: '80%', 
              maxHeight: '80%', 
              background: 'var(--bg-primary)', 
              padding: '24px', 
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#fff' }}>{previewAttachment.filename}</h3>
              <button onClick={() => setPreviewAttachment(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#fff' }}>✕</button>
            </div>
            
            <div style={{ overflow: 'auto', flex: 1, display: 'flex', justifyContent: 'center' }}>
              {previewAttachment.filedata.startsWith('data:image/') ? (
                <img src={previewAttachment.filedata} alt={previewAttachment.filename} style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }} />
              ) : previewAttachment.filedata.startsWith('data:application/pdf') ? (
                <iframe src={previewAttachment.filedata} title="PDF Preview" style={{ width: '600px', height: '400px', border: 'none' }} />
              ) : (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <p style={{ color: 'var(--text-secondary)' }}>{t('workspace.unsupported_preview')}</p>
                  <a href={previewAttachment.filedata} download={previewAttachment.filename} className="btn-primary" style={{ display: 'inline-block', textDecoration: 'none', marginTop: '10px' }}>
                    Herunterladen 📥
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

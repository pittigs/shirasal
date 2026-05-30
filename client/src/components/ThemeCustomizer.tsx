import React, { useEffect, useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';

interface ThemeSettings {
  bgType: 'preset' | 'custom';
  bgValue: string;
  accentColor: string;
  accentRgb: string;
  glassBlur: number;
  borderRadius: number;
  chatVisible: boolean;
  chatPosition: 'left' | 'right';
}

interface ThemeCustomizerProps {
  onChangeLayout: (visible: boolean, position: 'left' | 'right') => void;
}

const BG_PRESETS = [
  { name: 'Dark Space 🌌', value: 'linear-gradient(135deg, #0f0c1b 0%, #15102a 50%, #090613 100%)' },
  { name: 'Cyberpunk 👾', value: 'linear-gradient(135deg, #0d0211 0%, #20042d 45%, #050b1f 100%)' },
  { name: 'Forest Emerald 🌲', value: 'linear-gradient(135deg, #05241b 0%, #0c1a17 100%)' },
  { name: 'Deep Oceans 🌊', value: 'linear-gradient(135deg, #021128 0%, #040914 100%)' }
];

const ACCENTS = [
  { name: 'Cyber Purple', hex: '#8b5cf6', rgb: '139, 92, 246' },
  { name: 'Neon Cyan', hex: '#06b6d4', rgb: '6, 182, 212' },
  { name: 'Ruby Red', hex: '#f43f5e', rgb: '244, 63, 94' },
  { name: 'Emerald', hex: '#10b981', rgb: '16, 185, 129' },
  { name: 'Neon Yellow', hex: '#eab308', rgb: '234, 179, 8' }
];

export const ThemeCustomizer: React.FC<ThemeCustomizerProps> = ({ onChangeLayout }) => {
  const { t, language, setLanguage } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<ThemeSettings>({
    bgType: 'preset',
    bgValue: BG_PRESETS[0].value,
    accentColor: ACCENTS[0].hex,
    accentRgb: ACCENTS[0].rgb,
    glassBlur: 16,
    borderRadius: 16,
    chatVisible: true,
    chatPosition: 'right'
  });

  const [customBgUrl, setCustomBgUrl] = useState('');

  // 1. Theme-Einstellungen beim Start aus LocalStorage laden
  useEffect(() => {
    const saved = localStorage.getItem('voicechat-theme-settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ThemeSettings;
        // Fallbacks für neue Properties
        if (parsed.chatVisible === undefined) parsed.chatVisible = true;
        if (parsed.chatPosition === undefined) parsed.chatPosition = 'right';
        
        setSettings(parsed);
        applyTheme(parsed);
        onChangeLayout(parsed.chatVisible, parsed.chatPosition);

        if (parsed.bgType === 'custom') {
          // Extrahiere URL aus 'url("...")'
          const match = parsed.bgValue.match(/url\("?(.+?)"?\)/);
          if (match) setCustomBgUrl(match[1]);
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      // Wenn keine Einstellungen vorhanden, Standardwerte melden
      onChangeLayout(true, 'right');
    }
  }, []);

  // 2. Theme-Einstellungen auf DOM-Dokument übertragen
  const applyTheme = (s: ThemeSettings) => {
    const root = document.documentElement;
    root.style.setProperty('--bg-primary', s.bgValue);
    root.style.setProperty('--accent-color', s.accentColor);
    root.style.setProperty('--accent-rgb', s.accentRgb);
    root.style.setProperty('--glass-blur', `${s.glassBlur}px`);
    root.style.setProperty('--border-radius', `${s.borderRadius}px`);
  };

  const updateSettings = (newFields: Partial<ThemeSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newFields };
      applyTheme(updated);
      localStorage.setItem('voicechat-theme-settings', JSON.stringify(updated));
      onChangeLayout(updated.chatVisible, updated.chatPosition);
      return updated;
    });
  };

  const updateSetting = (key: keyof ThemeSettings, value: any) => {
    updateSettings({ [key]: value });
  };

  const handlePresetBg = (val: string) => {
    const updated = {
      ...settings,
      bgType: 'preset' as const,
      bgValue: val
    };
    setSettings(updated);
    applyTheme(updated);
    localStorage.setItem('voicechat-theme-settings', JSON.stringify(updated));
  };

  const handleCustomBgSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customBgUrl.trim()) return;
    const val = `url("${customBgUrl.trim()}") no-repeat center center / cover`;
    const updated = {
      ...settings,
      bgType: 'custom' as const,
      bgValue: val
    };
    setSettings(updated);
    applyTheme(updated);
    localStorage.setItem('voicechat-theme-settings', JSON.stringify(updated));
  };

  const hexToRgb = (hex: string): string => {
    const cleanHex = hex.replace(/^#/, '');
    const bigint = parseInt(cleanHex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
  };

  const handleCustomAccentColor = (hex: string) => {
    const rgb = hexToRgb(hex);
    updateSettings({ accentColor: hex, accentRgb: rgb });
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Schwebender Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="glass-panel"
        style={{
          padding: '10px 14px',
          border: 'var(--glass-border)',
          borderRadius: '20px',
          color: '#fff',
          cursor: 'pointer',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.9rem'
        }}
      >
        {t('customizer.button')}
      </button>

      {/* Customizer Sidebar */}
      {isOpen && (
        <div
          className="glass-panel fade-in"
          style={{
            position: 'absolute',
            top: '50px',
            right: '0',
            width: '320px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{t('customizer.title')}</h3>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1rem' }}
            >
              ✕
            </button>
          </div>

          <hr style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

          {/* 1. Hintergrund-Presets */}
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', fontWeight: 600 }}>{t('customizer.bg_label')}</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {BG_PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => handlePresetBg(p.value)}
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    border: settings.bgValue === p.value ? '2px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(0,0,0,0.2)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    textAlign: 'center'
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Custom Background URL */}
          <form onSubmit={handleCustomBgSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{t('customizer.custom_bg_url')}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder="https://example.com/image.jpg"
                value={customBgUrl}
                onChange={(e) => setCustomBgUrl(e.target.value)}
                className="input-field"
                style={{ padding: '6px 10px', fontSize: '0.8rem' }}
              />
              <button type="submit" className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                {t('common.confirm')}
              </button>
            </div>
          </form>

          <hr style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

          {/* 3. Akzentfarben */}
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', fontWeight: 600 }}>{t('customizer.accent_label')}</span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {ACCENTS.map((a) => (
                <button
                  key={a.hex}
                  onClick={() => {
                    updateSetting('accentColor', a.hex);
                    updateSetting('accentRgb', a.rgb);
                  }}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: a.hex,
                    border: settings.accentColor === a.hex ? '2px solid #fff' : 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                  }}
                  title={a.name}
                />
              ))}
            </div>
            
            {/* Freie Farbwahl */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('customizer.custom_accent_label')}</span>
              <input
                type="color"
                value={settings.accentColor.startsWith('#') ? settings.accentColor : '#8b5cf6'}
                onChange={(e) => handleCustomAccentColor(e.target.value)}
                style={{
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'none',
                  width: '32px',
                  height: '24px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  padding: 0
                }}
              />
            </div>
          </div>

          <hr style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

          {/* 4. Glass Blur Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              <span style={{ fontWeight: 600 }}>{t('customizer.blur_label')}</span>
              <span>{settings.glassBlur}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="24"
              value={settings.glassBlur}
              onChange={(e) => updateSetting('glassBlur', parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-color)', cursor: 'pointer' }}
            />
          </div>

          {/* 5. Border Radius Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              <span style={{ fontWeight: 600 }}>{t('customizer.rounded_label')}</span>
              <span>{settings.borderRadius}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="24"
              value={settings.borderRadius}
              onChange={(e) => updateSetting('borderRadius', parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-color)', cursor: 'pointer' }}
            />
          </div>

          <hr style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

          {/* 6. Layout-Einstellungen */}
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', fontWeight: 600 }}>{t('customizer.layout_options')}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              
              {/* Chat-Sichtbarkeit */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 500 }}>{t('customizer.show_chat')}</span>
                <button
                  onClick={() => updateSetting('chatVisible', !settings.chatVisible)}
                  className="btn-secondary"
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    borderColor: settings.chatVisible ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)',
                    background: settings.chatVisible ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(255,255,255,0.04)',
                    borderRadius: '8px'
                  }}
                >
                  {settings.chatVisible ? t('customizer.show_chat_btn') : t('customizer.hide_chat_btn')}
                </button>
              </div>

              {/* Chat-Position */}
              {settings.chatVisible && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 500 }}>{t('customizer.chat_position')}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => updateSetting('chatPosition', 'left')}
                      className="btn-secondary"
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.75rem',
                        borderColor: settings.chatPosition === 'left' ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)',
                        background: settings.chatPosition === 'left' ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(255,255,255,0.04)',
                        borderTopLeftRadius: '8px',
                        borderBottomLeftRadius: '8px',
                        borderTopRightRadius: '0px',
                        borderBottomRightRadius: '0px'
                      }}
                    >
                      {t('customizer.pos_left')}
                    </button>
                    <button
                      onClick={() => updateSetting('chatPosition', 'right')}
                      className="btn-secondary"
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.75rem',
                        borderColor: settings.chatPosition === 'right' ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)',
                        background: settings.chatPosition === 'right' ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(255,255,255,0.04)',
                        borderTopLeftRadius: '0px',
                        borderBottomLeftRadius: '0px',
                        borderTopRightRadius: '8px',
                        borderBottomRightRadius: '8px'
                      }}
                    >
                      {t('customizer.pos_right')}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>

          <hr style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

          {/* 7. Sprachauswahl */}
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', fontWeight: 600 }}>{t('customizer.language_label')}</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'de' | 'en')}
              className="input-field"
              style={{
                padding: '6px 10px',
                fontSize: '0.8rem',
                width: '100%',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}
            >
              <option value="de">Deutsch (DE)</option>
              <option value="en">English (EN)</option>
            </select>
          </div>

        </div>
      )}
    </div>
  );

};

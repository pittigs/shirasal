import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'de' | 'en';

const translations = {
  de: {
    common: {
      copied: 'Kopiert! ✓',
      copy: 'Kopieren',
      confirm: 'OK',
      cancel: 'Abbrechen',
      close: 'Schließen',
      save: 'Speichern',
      admin: 'Admin',
      member: 'Mitglied',
      guest: 'Gast',
      logout: 'Logout',
      rename: 'Umbenennen',
      new_name: 'Neuer Name',
      edit_name_title: 'Name ändern'
    },
    login: {
      title: 'Echo',
      subtitle: 'OpenSource Voice & Video Chat',
      register_tab: 'Konto erstellen',
      login_tab: 'Mit Key einloggen',
      role_label: 'Wähle deine Demo-Rolle',
      role_guest_desc: 'Sichtbarkeit: Nur öffentliche Kanäle.',
      role_member_desc: 'Sichtbarkeit: Öffentliche + Mitglieder-Kanäle.',
      role_admin_desc: 'Sichtbarkeit: Vollzugriff + eigene Kanäle erstellen.',
      register_btn: 'Zufälligen Account generieren 🎲',
      key_label: 'Gib deinen Account-Key ein',
      login_btn: 'Einloggen 🔑',
      key_placeholder: 'z.B. OX-8F2D-A91B-4E3F'
    },
    register_success: {
      title: 'Account registriert!',
      subtitle: 'Dein anonymer Account wurde auf dem Server hinterlegt.',
      random_name: 'Zufälliger Name',
      key_label: 'Account-Key (Sicherheits-Schlüssel)',
      important_warning: '⚠️ WICHTIG: Bitte speichere dir diesen Key ab. Solltest du deine Browsereinstellungen zurücksetzen, kannst du dich hiermit jederzeit wieder einloggen. Ohne den Key gehen deine Admin-Rechte verloren!',
      continue_btn: 'Fortfahren zum Chat 🚀'
    },
    controls: {
      mute_on: '🎤 Stumm',
      mute_off: '🎤 Mikrofon an',
      filter_on: '🔊 Filter: AN',
      filter_off: '🔊 Filter: AUS',
      screen_share_start: '🖥️ Screen',
      screen_share_stop: '🖥️ Stoppen',
      camera_start: '📷 Kamera',
      camera_stop: '📷 Stoppen',
      self_hearing_on: '🎧 Selber hören: AN',
      self_hearing_off: '🎧 Selber hören: AUS',
      headphone_warning: '⚠️ Trage Kopfhörer, um Pfeifen (Rückkopplung) zu vermeiden!',
      advanced_calibration: '⚙️ Advanced Audio Calibration',
      aec: 'Echo-Kompensation (AEC):',
      agc: 'Auto Verstärkung (AGC):',
      hpf: 'Tastatur Hochpass (HPF):',
      enabled: 'Aktiviert',
      disabled: 'Deaktiviert',
      voice_threshold: '🎙️ Voice Activation Threshold',
      voice_threshold_desc: 'Erhöhen, um Hintergrundstimmen und Rauschen auszufiltern.',
      mic_activity: 'Mikrofon-Aktivität'
    },
    channels: {
      text_channels: '💬 Textkanäle',
      voice_channels: '🗣️ Sprachkanäle',
      direct_messages: '👤 Direktnachrichten',
      no_other_users: 'Keine anderen User registriert',
      create_text_channel: 'Textkanal erstellen',
      create_voice_channel: 'Sprachkanal erstellen',
      placeholder_text_channel: 'kanal-name (z.B. gaming)',
      placeholder_voice_channel: 'Kanalname (z.B. Gaming)',
      role_required: 'Rolle:',
      role_guest_option: 'Gast (Jeder)',
      role_member_option: 'Mitglied',
      role_admin_option: 'Nur Admins',
      role_required_label: '🔑 Erfordert:',
      hangup: 'Auflegen',
      dm_title: 'PN an @{name} senden',
      dm_new: 'neu',
      you: 'Du'
    },
    chat: {
      default_title: 'Allgemeiner Chatraum',
      input_placeholder: 'Nachricht schreiben...',
      send: 'Senden',
      image_compression_error: 'Fehler bei der Bildkompression:',
      image_send_error: 'Das Bild konnte nicht komprimiert und gesendet werden.',
      shared_asset_title: 'Bild teilen',
      system: 'System'
    },
    admin_panel: {
      title: 'Server-Rechteverwaltung',
      tab_users: '👥 Benutzer online ({count})',
      tab_channels: '📂 Kanallizenzen & Sichtbarkeit',
      desc_users: 'Befördere Benutzer live oder benenne sie bei Verstößen direkt um.',
      no_other_online: 'Keine weiteren Benutzer online.',
      placeholder_new_name: 'Neuer Name',
      rename_btn: 'Umbenennen',
      role_guest_option: '👤 Gast',
      role_member_option: '🛡️ Mitglied',
      role_admin_option: '👑 Admin',
      text_perms: '💬 Textkanäle Berechtigungen',
      voice_perms: '🗣️ Sprachkanäle Berechtigungen',
      requires_label: 'Erfordert:'
    },
    customizer: {
      button: '🎨 Theme anpassen',
      title: 'UI Customizer',
      bg_label: 'Hintergrund',
      custom_bg_url: 'Eigenes Hintergrundbild (URL)',
      accent_label: 'Akzentfarbe',
      custom_accent_label: 'Eigene Farbe wählen:',
      blur_label: 'Glass-Blur',
      rounded_label: 'Eckenrundung',
      layout_options: 'Layout-Optionen',
      show_chat: 'Text-Chat anzeigen:',
      show_chat_btn: 'Anzeigen',
      hide_chat_btn: 'Ausblenden',
      chat_position: 'Chat-Position:',
      pos_left: 'Links',
      pos_right: 'Rechts',
      language_label: 'Sprache / Language'
    },
    roles: {
      admin: 'Admin',
      member: 'Mitglied',
      guest: 'Gast'
    }
  },
  en: {
    common: {
      copied: 'Copied! ✓',
      copy: 'Copy',
      confirm: 'OK',
      cancel: 'Cancel',
      close: 'Close',
      save: 'Save',
      admin: 'Admin',
      member: 'Member',
      guest: 'Guest',
      logout: 'Logout',
      rename: 'Rename',
      new_name: 'New Name',
      edit_name_title: 'Change Name'
    },
    login: {
      title: 'Echo',
      subtitle: 'OpenSource Voice & Video Chat',
      register_tab: 'Create Account',
      login_tab: 'Log in with Key',
      role_label: 'Choose your Demo Role',
      role_guest_desc: 'Visibility: Only public channels.',
      role_member_desc: 'Visibility: Public + member channels.',
      role_admin_desc: 'Visibility: Full access + create own channels.',
      register_btn: 'Generate random account 🎲',
      key_label: 'Enter your Account Key',
      login_btn: 'Log In 🔑',
      key_placeholder: 'e.g. OX-8F2D-A91B-4E3F'
    },
    register_success: {
      title: 'Account Registered!',
      subtitle: 'Your anonymous account has been saved on the server.',
      random_name: 'Random Name',
      key_label: 'Account Key (Security Key)',
      important_warning: '⚠️ IMPORTANT: Please save this key. If you clear your browser settings, you can log in again at any time using it. Without the key, your admin permissions will be lost!',
      continue_btn: 'Continue to Chat 🚀'
    },
    controls: {
      mute_on: '🎤 Mute',
      mute_off: '🎤 Microphone On',
      filter_on: '🔊 Filter: ON',
      filter_off: '🔊 Filter: OFF',
      screen_share_start: '🖥️ Screen',
      screen_share_stop: '🖥️ Stop',
      camera_start: '📷 Camera',
      camera_stop: '📷 Stop',
      self_hearing_on: '🎧 Self Hearing: ON',
      self_hearing_off: '🎧 Self Hearing: OFF',
      headphone_warning: '⚠️ Wear headphones to avoid whistling (feedback)!',
      advanced_calibration: '⚙️ Advanced Audio Calibration',
      aec: 'Echo Cancellation (AEC):',
      agc: 'Auto Gain Control (AGC):',
      hpf: 'Keyboard High Pass (HPF):',
      enabled: 'Enabled',
      disabled: 'Disabled',
      voice_threshold: '🎙️ Voice Activation Threshold',
      voice_threshold_desc: 'Increase to filter out background voices and noise.',
      mic_activity: 'Microphone Activity'
    },
    channels: {
      text_channels: '💬 Text Channels',
      voice_channels: '🗣️ Voice Channels',
      direct_messages: '👤 Direct Messages',
      no_other_users: 'No other users registered',
      create_text_channel: 'Create Text Channel',
      create_voice_channel: 'Create Voice Channel',
      placeholder_text_channel: 'channel-name (e.g. gaming)',
      placeholder_voice_channel: 'Channel name (e.g. Gaming)',
      role_required: 'Role:',
      role_guest_option: 'Guest (Everyone)',
      role_member_option: 'Member',
      role_admin_option: 'Admins Only',
      role_required_label: '🔑 Requires:',
      hangup: 'Hang up',
      dm_title: 'Send DM to @{name}',
      dm_new: 'new',
      you: 'You'
    },
    chat: {
      default_title: 'General Chatroom',
      input_placeholder: 'Type a message...',
      send: 'Send',
      image_compression_error: 'Image compression error:',
      image_send_error: 'The image could not be compressed and sent.',
      shared_asset_title: 'Share image',
      system: 'System'
    },
    admin_panel: {
      title: 'Server Permissions Management',
      tab_users: '👥 Users Online ({count})',
      tab_channels: '📂 Channel Licenses & Visibility',
      desc_users: 'Promote users live or rename them directly in case of violations.',
      no_other_online: 'No other users online.',
      placeholder_new_name: 'New Name',
      rename_btn: 'Rename',
      role_guest_option: '👤 Guest',
      role_member_option: '🛡️ Member',
      role_admin_option: '👑 Admin',
      text_perms: '💬 Text Channels Permissions',
      voice_perms: '🗣️ Voice Channels Permissions',
      requires_label: 'Requires:'
    },
    customizer: {
      button: '🎨 Customize Theme',
      title: 'UI Customizer',
      bg_label: 'Background',
      custom_bg_url: 'Custom background image (URL)',
      accent_label: 'Accent Color',
      custom_accent_label: 'Choose custom color:',
      blur_label: 'Glass Blur',
      rounded_label: 'Corner Rounding',
      layout_options: 'Layout Options',
      show_chat: 'Show Text Chat:',
      show_chat_btn: 'Show',
      hide_chat_btn: 'Hide',
      chat_position: 'Chat Position:',
      pos_left: 'Left',
      pos_right: 'Right',
      language_label: 'Language / Sprache'
    },
    roles: {
      admin: 'Admin',
      member: 'Member',
      guest: 'Guest'
    }
  }
} as const;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, any>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('de');

  useEffect(() => {
    // 1. Aus LocalStorage laden
    const saved = localStorage.getItem('echo-language');
    if (saved === 'de' || saved === 'en') {
      setLanguageState(saved);
    } else {
      // 2. Browsersprache auswerten (Standard DE oder EN)
      const browserLang = navigator.language.substring(0, 2);
      const initialLang: Language = browserLang === 'en' ? 'en' : 'de';
      setLanguageState(initialLang);
      localStorage.setItem('echo-language', initialLang);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('echo-language', lang);
    // Optional: Ändert das lang-Attribut im HTML-Tag für Barrierefreiheit/Browser-Übersetzung
    document.documentElement.lang = lang;
  };

  const t = (key: string, params?: Record<string, any>): string => {
    const keys = key.split('.');
    let current: any = translations[language];

    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        // Fallback auf Englisch
        let fallback: any = translations['en'];
        for (const fk of keys) {
          if (fallback && typeof fallback === 'object' && fk in fallback) {
            fallback = fallback[fk];
          } else {
            return key; // Key ausgeben, wenn gar nichts gefunden wird
          }
        }
        current = fallback;
        break;
      }
    }

    if (typeof current !== 'string') {
      return key;
    }

    let text = current;
    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
      });
    }

    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};

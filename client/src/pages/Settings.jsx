import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  Settings as SettingsIcon,
  Store,
  MessageSquare,
  Users,
  Database,
  Download,
  Plus,
  KeyRound,
  Trash2,
  Check,
  Save,
  AlertCircle,
  X,
  Image as ImageIcon,
  FileSpreadsheet
} from 'lucide-react';

export default function Settings() {
  const { user, isOwner, shopSettings, fetchSettings, t } = useAuth();

  const [activeSection, setActiveSection] = useState('shop');
  const [formData, setFormData] = useState({
    gsheets_enabled: 'false',
    gsheets_sheet_id: '',
    gsheets_client_email: '',
    gsheets_private_key: '',
    gsheets_bills_sheet: 'Bills'
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Users State
  const [usersList, setUsersList] = useState([]);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    username: '',
    password: '',
    name: '',
    role: 'worker',
    can_view_dues: false,
    can_view_inventory: false
  });
  const [resetPwdUserId, setResetPwdUserId] = useState(null);
  const [newPasswordVal, setNewPasswordVal] = useState('');

  // Backup State
  const [backups, setBackups] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);

  useEffect(() => {
    if (shopSettings) {
      setFormData(shopSettings);
    }
  }, [shopSettings]);

  useEffect(() => {
    if (activeSection === 'users') {
      loadUsers();
    } else if (activeSection === 'backup') {
      loadBackups();
    }
  }, [activeSection]);

  const loadUsers = async () => {
    try {
      const res = await api.getUsers();
      setUsersList(res.users || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadBackups = async () => {
    try {
      const res = await api.listBackups();
      setBackups(res.backups || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleInputChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file (PNG/JPG).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 600;
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        handleInputChange('shop_logo', canvas.toDataURL('image/png', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    setStatusMsg('');
    try {
      await api.updateSettings(formData);
      await fetchSettings();
      setStatusMsg('Shop settings and templates saved successfully!');
    } catch (err) {
      alert(err.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  // User Actions
  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await api.createUser(newUserForm);
      setShowAddUserModal(false);
      setNewUserForm({
        username: '',
        password: '',
        name: '',
        role: 'worker',
        can_view_dues: false,
        can_view_inventory: false
      });
      loadUsers();
      alert('User created successfully');
    } catch (err) {
      alert(err.message || 'Failed to create user');
    }
  };

  const handleTogglePermission = async (targetUser, field) => {
    try {
      const updatedVal = targetUser[field] === 1 ? 0 : 1;
      await api.updateUser(targetUser.id, {
        [field]: updatedVal
      });
      loadUsers();
    } catch (err) {
      alert(err.message || 'Failed to update permission');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    try {
      await api.resetPassword(resetPwdUserId, newPasswordVal);
      setResetPwdUserId(null);
      setNewPasswordVal('');
      alert('Password updated successfully');
    } catch (err) {
      alert(err.message || 'Failed to reset password');
    }
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Delete staff account for ${u.name}?`)) return;
    try {
      await api.deleteUser(u.id);
      loadUsers();
    } catch (err) {
      alert(err.message || 'Failed to delete user');
    }
  };

  const handleTriggerSnapshot = async () => {
    setBackupLoading(true);
    try {
      await api.triggerBackup();
      loadBackups();
      alert('Manual backup snapshot created successfully');
    } catch (err) {
      alert(err.message || 'Failed to create backup');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleDownloadBackup = () => {
    const token = localStorage.getItem('mab_token');
    window.location.href = `/api/backup/download?token=${encodeURIComponent(token)}`;
  };

  return (
    <div className="max-w-5xl mx-auto px-3 py-3 sm:py-6 pb-28">
      <div className="border-b-2 border-slate-200 pb-3 mb-4">
        <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
          <span>{t.settings} & Store Management</span>
          <span className="text-xs bg-accent-700 text-white font-bold px-2 py-0.5 rounded">
            Owner Only
          </span>
        </h2>
        <p className="text-xs text-slate-500 font-semibold mt-0.5">
          Configure shop profile, WhatsApp/SMS keys, staff permissions, and database backup
        </p>
      </div>

      {statusMsg && (
        <div className="mb-4 p-3 bg-emerald-100 border border-emerald-300 text-emerald-900 font-bold text-xs rounded flex items-center justify-between">
          <span>{statusMsg}</span>
          <button type="button" onClick={() => setStatusMsg('')} className="underline font-bold">Dismiss</button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex space-x-1 border-b border-slate-300 mb-5 overflow-x-auto">
        {[
          { id: 'shop', label: 'Shop Profile', icon: Store },
          { id: 'templates', label: 'Message Templates', icon: MessageSquare },
          { id: 'api_keys', label: 'WhatsApp & SMS Keys', icon: MessageSquare },
          { id: 'sheets', label: 'Google Sheets Sync', icon: FileSpreadsheet },
          { id: 'users', label: 'Users & Permissions', icon: Users },
          { id: 'backup', label: 'Database Backup', icon: Database },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`flex items-center space-x-1.5 px-4 py-2.5 border-b-2 text-xs font-bold whitespace-nowrap transition-colors ${
                isActive
                  ? 'border-accent-700 text-accent-700 bg-blue-50/50'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: SHOP PROFILE */}
      {activeSection === 'shop' && (
        <form onSubmit={handleSaveSettings} className="bg-white border-2 border-slate-300 rounded-lg p-4 space-y-3.5 text-xs shadow-sm">
          <h3 className="text-sm font-black text-slate-900 border-b pb-1">Shop Profile & Invoice Header</h3>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <label className="block font-bold text-slate-700 mb-1">Shop Logo (printed on invoice)</label>
            <div className="flex items-center space-x-3">
              {formData.shop_logo ? (
                <img src={formData.shop_logo} alt="Shop logo preview" className="h-16 w-16 object-contain bg-white border border-slate-300 rounded" />
              ) : (
                <div className="h-16 w-16 flex items-center justify-center bg-white border border-dashed border-slate-300 rounded text-slate-400">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="px-3 py-2 bg-accent-700 hover:bg-accent-800 text-white font-bold rounded text-xs cursor-pointer">
                  Upload Logo
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
                {formData.shop_logo && (
                  <button
                    type="button"
                    onClick={() => handleInputChange('shop_logo', '')}
                    className="px-3 py-2 bg-white text-red-700 border border-red-300 rounded text-xs font-bold hover:bg-red-50"
                  >
                    Remove Logo
                  </button>
                )}
                <span className="text-[11px] text-slate-500">Square PNG/JPG works best. Auto-resized before upload.</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Shop Name *</label>
              <input
                type="text"
                required
                value={formData.shop_name || ''}
                onChange={(e) => handleInputChange('shop_name', e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Tagline</label>
              <input
                type="text"
                value={formData.tagline || ''}
                onChange={(e) => handleInputChange('tagline', e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Shop Address</label>
            <input
              type="text"
              value={formData.address || ''}
              onChange={(e) => handleInputChange('address', e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 rounded"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Primary Phone</label>
              <input
                type="text"
                value={formData.phone || ''}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded font-semibold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Alternate Phone</label>
              <input
                type="text"
                value={formData.alt_phone || ''}
                onChange={(e) => handleInputChange('alt_phone', e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">GSTIN (Optional)</label>
              <input
                type="text"
                value={formData.gst_number || ''}
                onChange={(e) => handleInputChange('gst_number', e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded font-mono uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Shop UPI ID (for QR codes &amp; reminders)</label>
              <input
                type="text"
                value={formData.upi_id || ''}
                onChange={(e) => handleInputChange('upi_id', e.target.value)}
                placeholder="e.g. shopname@okhdfcbank"
                className="w-full h-10 px-3 border border-slate-300 rounded font-semibold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">UPI Payee Name (shown in UPI apps)</label>
              <input
                type="text"
                value={formData.upi_payee_name || ''}
                onChange={(e) => handleInputChange('upi_payee_name', e.target.value)}
                placeholder="Maharashtra Auto Battery"
                className="w-full h-10 px-3 border border-slate-300 rounded font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Owner Mobile (for New Bill Alerts)</label>
              <input
                type="text"
                value={formData.owner_mobile || ''}
                onChange={(e) => handleInputChange('owner_mobile', e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded font-semibold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Invoice Footer Note</label>
              <input
                type="text"
                value={formData.invoice_note || ''}
                onChange={(e) => handleInputChange('invoice_note', e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Invoice Terms & Conditions</label>
            <textarea
              rows={2}
              value={formData.terms || ''}
              onChange={(e) => handleInputChange('terms', e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={savingSettings}
              className="px-5 py-2.5 bg-accent-700 hover:bg-accent-800 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow"
            >
              <Save className="w-4 h-4" />
              <span>{savingSettings ? 'Saving...' : 'Save Shop Settings'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: MESSAGE TEMPLATES */}
      {activeSection === 'templates' && (
        <form onSubmit={handleSaveSettings} className="bg-white border-2 border-slate-300 rounded-lg p-4 space-y-4 text-xs shadow-sm">
          <div className="border-b pb-2">
            <h3 className="text-sm font-black text-slate-900">WhatsApp & SMS Message Templates</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Available variables: {'{bill_no}'}, {'{date}'}, {'{customer_name}'}, {'{battery_desc}'}, {'{serial_no}'}, {'{exchange_discount}'}, {'{amount_paid}'}, {'{balance_due}'}, {'{grand_total}'}, {'{payment_mode}'}, {'{warranty_months}'}, {'{upi_id}'}, {'{shop_phone}'}
            </p>
          </div>

          {/* New Bill Customer Template */}
          <div>
            <label className="block font-bold text-slate-800 mb-1">
              Customer Bill Summary Template
            </label>
            <textarea
              rows={6}
              value={formData.msg_template_bill || ''}
              onChange={(e) => handleInputChange('msg_template_bill', e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded font-mono text-xs bg-slate-50"
            />
          </div>

          {/* Owner Alert Template */}
          <div>
            <label className="block font-bold text-slate-800 mb-1">
              Owner Alert Template (Instant alert to owner mobile when bill is created)
            </label>
            <textarea
              rows={4}
              value={formData.msg_template_owner || ''}
              onChange={(e) => handleInputChange('msg_template_owner', e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded font-mono text-xs bg-slate-50"
            />
          </div>

          {/* Payment Receipt Template */}
          <div>
            <label className="block font-bold text-slate-800 mb-1">
              Payment Received Receipt Template
            </label>
            <textarea
              rows={4}
              value={formData.msg_template_payment || ''}
              onChange={(e) => handleInputChange('msg_template_payment', e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded font-mono text-xs bg-slate-50"
            />
          </div>

          {/* Due Reminder Template */}
          <div>
            <label className="block font-bold text-slate-800 mb-1">
              Customer Dues Reminder Template
            </label>
            <textarea
              rows={4}
              value={formData.msg_template_reminder || ''}
              onChange={(e) => handleInputChange('msg_template_reminder', e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded font-mono text-xs bg-slate-50"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={savingSettings}
              className="px-5 py-2.5 bg-accent-700 hover:bg-accent-800 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow"
            >
              <Save className="w-4 h-4" />
              <span>{savingSettings ? 'Saving...' : 'Save Templates'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: API KEYS */}
      {activeSection === 'api_keys' && (
        <form onSubmit={handleSaveSettings} className="bg-white border-2 border-slate-300 rounded-lg p-4 space-y-4 text-xs shadow-sm">
          <div className="border-b pb-2">
            <h3 className="text-sm font-black text-slate-900">API Keys (WhatsApp Cloud & SMS)</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              If API keys are left blank, the app will automatically generate pre-filled WhatsApp links (wa.me) so you can send messages completely free without any paid APIs!
            </p>
          </div>

          {/* WhatsApp Cloud API */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
            <span className="font-bold text-blue-900 block text-sm">Meta WhatsApp Cloud API (Primary)</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone Number ID</label>
                <input
                  type="text"
                  placeholder="e.g. 109283719283123"
                  value={formData.whatsapp_phone_number_id || ''}
                  onChange={(e) => handleInputChange('whatsapp_phone_number_id', e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded font-mono bg-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">System User Access Token</label>
                <input
                  type="password"
                  placeholder="EAAG..."
                  value={formData.whatsapp_access_token || ''}
                  onChange={(e) => handleInputChange('whatsapp_access_token', e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded font-mono bg-white"
                />
              </div>
            </div>
          </div>

          {/* Twilio SMS */}
          <div className="p-3 bg-slate-50 border border-slate-300 rounded-lg space-y-3">
            <span className="font-bold text-slate-900 block text-sm">Twilio SMS (Optional Fallback)</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Account SID</label>
                <input
                  type="text"
                  placeholder="AC..."
                  value={formData.twilio_account_sid || ''}
                  onChange={(e) => handleInputChange('twilio_account_sid', e.target.value)}
                  className="w-full h-9 px-2 border rounded font-mono bg-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Auth Token</label>
                <input
                  type="password"
                  placeholder="Token"
                  value={formData.twilio_auth_token || ''}
                  onChange={(e) => handleInputChange('twilio_auth_token', e.target.value)}
                  className="w-full h-9 px-2 border rounded font-mono bg-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">From Phone Number</label>
                <input
                  type="text"
                  placeholder="+1234567890"
                  value={formData.twilio_phone_number || ''}
                  onChange={(e) => handleInputChange('twilio_phone_number', e.target.value)}
                  className="w-full h-9 px-2 border rounded font-mono bg-white"
                />
              </div>
            </div>
          </div>

          {/* Fast2SMS */}
          <div className="p-3 bg-slate-50 border border-slate-300 rounded-lg space-y-2">
            <span className="font-bold text-slate-900 block text-sm">Fast2SMS Indian SMS (Optional Fallback)</span>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Fast2SMS API Key</label>
              <input
                type="password"
                placeholder="API Key"
                value={formData.fast2sms_api_key || ''}
                onChange={(e) => handleInputChange('fast2sms_api_key', e.target.value)}
                className="w-full h-9 px-3 border border-slate-300 rounded font-mono bg-white"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={savingSettings}
              className="px-5 py-2.5 bg-accent-700 hover:bg-accent-800 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow"
            >
              <Save className="w-4 h-4" />
              <span>{savingSettings ? 'Saving...' : 'Save API Configuration'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: USERS & PERMISSIONS */}
      {activeSection === 'users' && (
        <div className="bg-white border-2 border-slate-300 rounded-lg p-4 space-y-4 text-xs shadow-sm">
          <div className="flex justify-between items-center border-b pb-2">
            <div>
              <h3 className="text-sm font-black text-slate-900">User Accounts & Roles</h3>
              <p className="text-[11px] text-slate-500">
                Manage counter staff, roles, and manager report access permissions
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddUserModal(true)}
              className="px-3 py-1.5 bg-accent-700 hover:bg-accent-800 text-white font-bold rounded text-xs flex items-center space-x-1 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add User</span>
            </button>
          </div>

          <div className="divide-y divide-slate-200">
            {usersList.map(u => (
              <div key={u.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-black text-slate-900 text-sm">{u.name}</span>
                    <span className="text-slate-500 font-mono">(@{u.username})</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                      u.role === 'owner'
                        ? 'bg-blue-100 text-blue-900 border border-blue-300'
                        : u.role === 'manager'
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        : 'bg-slate-100 text-slate-800 border border-slate-300'
                    }`}>
                      {u.role}
                    </span>
                  </div>

                  {u.role === 'manager' && (
                    <div className="flex items-center space-x-4 mt-2">
                      <label className="flex items-center space-x-1 font-bold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={u.can_view_dues === 1}
                          onChange={() => handleTogglePermission(u, 'can_view_dues')}
                          className="w-3.5 h-3.5 text-accent-700"
                        />
                        <span>Can View Customer Dues</span>
                      </label>
                      <label className="flex items-center space-x-1 font-bold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={u.can_view_inventory === 1}
                          onChange={() => handleTogglePermission(u, 'can_view_inventory')}
                          className="w-3.5 h-3.5 text-accent-700"
                        />
                        <span>Can View Inventory Valuation</span>
                      </label>
                    </div>
                  )}

                  {u.role === 'worker' && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Worker permissions: Can create bills; can view/edit only today's bills; no delete access.
                    </p>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetPwdUserId(u.id);
                      setNewPasswordVal('');
                    }}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded border text-xs flex items-center space-x-1"
                  >
                    <KeyRound className="w-3 h-3" />
                    <span>Reset Password</span>
                  </button>

                  {user?.id !== u.id && (
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(u)}
                      className="p-1 text-slate-400 hover:text-red-700 rounded hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: GOOGLE SHEETS SYNC */}
      {activeSection === 'sheets' && (
        <form onSubmit={handleSaveSettings} className="bg-white border-2 border-slate-300 rounded-lg p-4 space-y-3.5 text-xs shadow-sm">
          <div className="border-b pb-2">
            <h3 className="text-sm font-black text-slate-900">Google Sheets Auto-Sync</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Automatically append every bill and payment to your own Google Sheet. 1 row per bill, payments added on the same Bills tab. Each shop can use their own sheet.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <input
              id="gsheets_enabled"
              type="checkbox"
              checked={formData.gsheets_enabled === 'true'}
              onChange={(e) => handleInputChange('gsheets_enabled', e.target.checked ? 'true' : 'false')}
              className="w-4 h-4"
            />
            <label htmlFor="gsheets_enabled" className="font-bold text-slate-800">Enable Google Sheets Sync</label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Google Sheet ID *</label>
              <input
                type="text"
                value={formData.gsheets_sheet_id || ''}
                onChange={(e) => handleInputChange('gsheets_sheet_id', e.target.value)}
                placeholder="e.g. 1AbC...XyZ"
                className="w-full h-10 px-3 border border-slate-300 rounded font-mono text-xs"
              />
              <p className="text-[10px] text-slate-500 mt-0.5">From URL: docs.google.com/spreadsheets/d/<strong>SHEET_ID</strong>/edit</p>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Bills Sheet Tab Name</label>
              <input
                type="text"
                value={formData.gsheets_bills_sheet || 'Bills'}
                onChange={(e) => handleInputChange('gsheets_bills_sheet', e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Service Account Email *</label>
            <input
              type="email"
              value={formData.gsheets_client_email || ''}
              onChange={(e) => handleInputChange('gsheets_client_email', e.target.value)}
              placeholder="mab-sheets-sync@project-id.iam.gserviceaccount.com"
              className="w-full h-10 px-3 border border-slate-300 rounded font-mono text-xs"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Service Account Private Key *</label>
            <textarea
              value={formData.gsheets_private_key || ''}
              onChange={(e) => handleInputChange('gsheets_private_key', e.target.value)}
              placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
              rows={6}
              className="w-full px-3 py-2 border border-slate-300 rounded font-mono text-[10px]"
            />
            <p className="text-[10px] text-slate-500 mt-0.5">Paste the private_key from your downloaded service account JSON. Share the Sheet with this email as Editor.</p>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="px-6 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg flex items-center space-x-2 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              <span>{savingSettings ? 'Saving...' : 'Save Google Sheets Settings'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 6: DATABASE BACKUP */}
      {activeSection === 'backup' && (
        <div className="bg-white border-2 border-slate-300 rounded-lg p-4 space-y-4 text-xs shadow-sm">
          <div className="border-b pb-2">
            <h3 className="text-sm font-black text-slate-900">Database Backup & Recovery</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              The database automatically backs up daily to disk. You can also download a fresh copy (.sqlite) anytime.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadBackup}
              className="px-4 py-2.5 bg-accent-700 hover:bg-accent-800 text-white font-bold rounded-lg text-xs flex items-center space-x-2 shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Download Backup (.sqlite)</span>
            </button>

            <button
              type="button"
              disabled={backupLoading}
              onClick={handleTriggerSnapshot}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs border border-slate-300 flex items-center space-x-2"
            >
              <Database className="w-4 h-4" />
              <span>{backupLoading ? 'Creating...' : 'Create Snapshot Now'}</span>
            </button>
          </div>

          {/* Backup History */}
          <div className="border-t pt-3">
            <h4 className="font-bold text-slate-800 mb-2">Saved Backups on Server ({backups.length}):</h4>
            <div className="space-y-1 max-h-48 overflow-y-auto divide-y divide-slate-100">
              {backups.map((b, idx) => (
                <div key={idx} className="py-1.5 flex justify-between items-center text-xs">
                  <span className="font-mono text-slate-800">{b.fileName}</span>
                  <span className="text-slate-500">
                    {Math.round(b.sizeBytes / 1024)} KB • {new Date(b.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ADD USER MODAL */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border-2 border-accent-700 shadow-2xl my-auto">
            <div className="flex justify-between items-center border-b pb-2 mb-3">
              <h3 className="text-base font-black text-slate-900">Add Staff Account</h3>
              <button type="button" onClick={() => setShowAddUserModal(false)}>
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-0.5">Staff Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Shinde"
                  value={newUserForm.name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                  className="w-full h-9 px-2 border rounded font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Username *</label>
                  <input
                    type="text"
                    required
                    placeholder="ramesh"
                    value={newUserForm.username}
                    onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                    className="w-full h-9 px-2 border rounded font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="Password"
                    value={newUserForm.password}
                    onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    className="w-full h-9 px-2 border rounded"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-0.5">Role *</label>
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                  className="w-full h-9 px-2 border rounded font-semibold bg-white"
                >
                  <option value="worker">Worker (Create bills, view today's bills only)</option>
                  <option value="manager">Manager (Father - Edit bills, all records, price edits)</option>
                  <option value="owner">Owner (Full Admin Access)</option>
                </select>
              </div>

              {newUserForm.role === 'manager' && (
                <div className="p-2.5 bg-emerald-50 rounded border border-emerald-200 space-y-1.5">
                  <span className="font-bold text-emerald-900 block text-[11px]">Grant Owner Reports to Manager:</span>
                  <label className="flex items-center space-x-1.5 text-xs text-slate-800">
                    <input
                      type="checkbox"
                      checked={newUserForm.can_view_dues}
                      onChange={(e) => setNewUserForm({ ...newUserForm, can_view_dues: e.target.checked })}
                    />
                    <span>Allow Customer Dues Page</span>
                  </label>
                  <label className="flex items-center space-x-1.5 text-xs text-slate-800">
                    <input
                      type="checkbox"
                      checked={newUserForm.can_view_inventory}
                      onChange={(e) => setNewUserForm({ ...newUserForm, can_view_inventory: e.target.checked })}
                    />
                    <span>Allow Inventory Valuation Page</span>
                  </label>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-3 py-2 bg-slate-100 rounded text-slate-700 font-bold border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-accent-700 text-white rounded font-black shadow"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {resetPwdUserId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-xl max-w-sm w-full p-4 border-2 border-slate-800 shadow-2xl">
            <h3 className="text-sm font-black text-slate-900 mb-2">Reset Password</h3>
            <form onSubmit={handleResetPassword} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-0.5">New Password *</label>
                <input
                  type="password"
                  required
                  placeholder="Min 4 characters"
                  value={newPasswordVal}
                  onChange={(e) => setNewPasswordVal(e.target.value)}
                  className="w-full h-9 px-2 border rounded"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setResetPwdUserId(null)}
                  className="px-3 py-1.5 bg-slate-100 rounded font-bold border text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-slate-900 text-white rounded font-bold"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

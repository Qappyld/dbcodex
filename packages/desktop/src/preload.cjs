const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dbcodex', {
  call: (name, args) => ipcRenderer.invoke('dbcodex:call', name, args),
  onClose: callback => { const listener = async () => { try { await callback(); ipcRenderer.send('dbcodex:closed', true); } catch { ipcRenderer.send('dbcodex:closed', false); } }; ipcRenderer.on('dbcodex:closing', listener); return () => ipcRenderer.removeListener('dbcodex:closing', listener); }
});

const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dbcodex', {
  call: (name, args) => ipcRenderer.invoke('dbcodex:call', name, args),
  onLiveRequest: handler => {
    const listener = async (_event, message) => {
      try { ipcRenderer.send('dbcodex:live-response', { id: message.id, result: await handler(message.request) }); }
      catch (error) { ipcRenderer.send('dbcodex:live-response', { id: message.id, error: error instanceof Error ? error.message : 'Commande refusée.' }); }
    };
    ipcRenderer.on('dbcodex:live-request', listener);
    return () => ipcRenderer.removeListener('dbcodex:live-request', listener);
  },
  onClose: callback => { const listener = async () => { try { await callback(); ipcRenderer.send('dbcodex:closed', true); } catch { ipcRenderer.send('dbcodex:closed', false); } }; ipcRenderer.on('dbcodex:closing', listener); return () => ipcRenderer.removeListener('dbcodex:closing', listener); }
});

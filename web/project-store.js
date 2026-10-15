import { validateProjectSnapshot, verifyProjectFile } from '../src/domain/project-snapshot.js';

/** One local recovery point; model bytes remain in the browser, with atomic state/file writes. */
export function createProjectStore() {
  let opening;
  function database() {
    if (!opening) opening = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(new Error('浏览器不支持本地项目存储，可导出备份')); return; }
      const request = indexedDB.open('ecometrolink-projects', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('projects');
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); opening = null; }; resolve(request.result); };
      request.onerror = () => { opening = null; reject(request.error); };
      request.onblocked = () => reject(new Error('本地存储正被其他窗口占用'));
    });
    return opening;
  }
  return {
    async save(state, file, preview = null) {
      state = validateProjectSnapshot(state);
      // File identity is verified once on load/import; checksum is rechecked when restoring.
      if (!file || file.name !== state.model.fileName || file.size <= 0 || file.size > 80 * 1024 * 1024) throw new Error('无法保存模型文件');
      if(preview !== null && (typeof preview !== 'string' || preview.length > 1024*1024 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(preview))) throw new Error('项目预览无效');
      const db = await database();
      await new Promise((resolve, reject) => { const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put({ state, file, preview }, 'latest'); tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('保存失败')); });
    },
    async load() {
      const db = await database();
      const record = await new Promise((resolve, reject) => { const request = db.transaction('projects').objectStore('projects').get('latest'); request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => reject(request.error); });
      if (!record) return null;
      const state = validateProjectSnapshot(record.state), file = new File([record.file], state.model.fileName);
      const preview=typeof record.preview==='string' && record.preview.length<=1024*1024 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(record.preview) ? record.preview : null;
      await verifyProjectFile(state, file); return { state, file, preview };
    }
  };
}

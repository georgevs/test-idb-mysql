// index.js

//----------------------------------------------------------------------------------------
const uniqueIndex = fn => xs => xs.reduce((acc, x) => acc.set(fn(x), x), new Map);

const diffSet = (lhs, rhs) => new Set(Array.from(lhs).filter(x => !rhs.has(x)));
const intsSet = (lhs, rhs) => new Set(Array.from(lhs).filter(x => rhs.has(x)));

const eq = (x, y) => {
  if (x === y) { return true }
  if (x instanceof Set && y instanceof Set) {
    return eq(Array.from(x.values()).sort(), Array.from(y.values()).sort());
  }
  if (Array.isArray(x) && Array.isArray(y)) {
    return x.length === y.length && x.every((v, i) => eq(v, y[i]));
  }
  if (Object(x) === x && Object(y) === y) {
    return eq(Object.entries(x).sort(compareKey), Object.entries(y).sort(compareKey));
  }
  return false;
};
const compareKey = ([lhs], [rhs]) => lhs.localeCompare(rhs);


//----------------------------------------------------------------------------------------
class UsersSDK {
  constructor({ baseUrl }) { this.baseUrl = new URL(baseUrl) }
  users() {
    console.log('db/users');
    return fetch(new URL('users', this.baseUrl))
      .then(res => {
        if (!res.ok) { throw Error(res.statusText) }
        return res.json();
      });
  }
}

//----------------------------------------------------------------------------------------
class UsersIDB {
  constructor() {
    const upgrade = (db, { oldVersion, newVersion }) => {
      db.createObjectStore('Users', { keyPath: 'id' });
    };
    this.db = new Promise((resolve, reject) => {
      const req = window.indexedDB.open('Users', 1);
      req.onerror = () => { reject(req.error) };
      req.onsuccess = () => { resolve(req.result) };
      req.onupgradeneeded = (event) => { upgrade(req.result, event) };
    });
  }
  open() { return this.db }
  users() {
    console.log('idb/users');
    return this.db.then(db => new Promise((resolve, reject) => {
      const tr = db.transaction(['Users'], 'readonly');
      tr.onerror = () => { reject(tr.error) };
      const store = tr.objectStore('Users');
      const req = store.getAll();
      req.onsuccess = () => { resolve(req.result) };
    }));
  }
  putUsers(users) {
    console.log('idb/putUsers', users);
    return this.db.then(db => new Promise((resolve, reject) => {
      const tr = db.transaction(['Users'], 'readwrite');
      tr.onerror = () => { reject(tr.error) };
      tr.oncomplete = () => { resolve() };
      const store = tr.objectStore('Users');
      users.forEach(user => { store.put(user) });
    }));
  }
  deleteUsers(ids) {
    console.log('idb/deleteUsers', ids);
    return this.db.then(db => new Promise((resolve, reject) => {
      const tr = db.transaction(['Users'], 'readwrite');
      tr.onerror = () => { reject(tr.error) };
      tr.oncomplete = () => { resolve() };
      const store = tr.objectStore('Users');
      ids.forEach(id => { store.delete(id) });
    }));
  }
}

//----------------------------------------------------------------------------------------
function loadUsers(model) {
  console.log('loadUsers');

  model.setLoading();

  const sdk = new UsersSDK(config().backend);
  const idb = new UsersIDB();

  const f = sdk.users().then(users => ({ users, kind: 'fetched' }));
  const o = idb.open();
  const r = idb.users().then(users => ({ users, kind: 'persisted' }));

  Promise.all([f, r])
    .then(([{ users: dbUsers }, { users: idbUsers }]) => {
      const idbIds = new Set(idbUsers.map(({ id }) => id));
      const dbIds = new Set(dbUsers.map(({ id }) => id));
      const removed = diffSet(idbIds, dbIds);
      idb.deleteUsers(removed);
      idb.putUsers(dbUsers);
    });

  Promise.any([f, r])
    .then(({ users, kind }) => {
      if (kind === 'persisted') { model.loadedUsers(users) }
      return f;
    })
    .then(({ users }) => { model.loadedUsers(users) })
    .catch(err => { model.loadError(err) })
    .then(() => { model.clearLoading() });
}

//----------------------------------------------------------------------------------------
class Model extends EventTarget {
  constructor() {
    super();
    this.users = new Map;
    this.loading = false;
    this.err = null;
  }
  setLoading() {
    console.log('model/setLoading');
    this.loading = true;
    this.loadErr = null;
    this.dispatchEvent(new CustomEvent('model:loading'));
  }
  loadedUsers(data) {
    console.log('model/loadedUsers', data);
    const users = uniqueIndex(({ id }) => id)(data);
    const oldIds = new Set(this.users.keys());
    const newIds = new Set(users.keys());
    const added = diffSet(newIds, oldIds);
    const removed = diffSet(oldIds, newIds);
    const updated = new Set(
      Array.from(intsSet(oldIds, newIds).keys())
        .filter(id => !eq(users.get(id), this.users.get(id)))
    );
    if (added.size + removed.size + updated.size > 0) {
      this.users = users;
      this.dispatchEvent(new CustomEvent('model:loadedUsers', { detail: { added, removed, updated } }));
    }
  }
  loadError(err) {
    console.log('model/loadError', err);
    this.err = err;
    this.dispatchEvent(new customElement('model:loadError'));
  }
  clearLoading() {
    console.log('model/clearLoading');
    this.loading = false;
    this.dispatchEvent(new CustomEvent('model:loading'));
  }
}

//----------------------------------------------------------------------------------------
class Ui {
  constructor(model) {
    model.addEventListener('model:loading', e => { this.renderLoading(e.target.loading) });
    model.addEventListener('model:loadedUsers', e => { this.renderUsers(e.target.users, e.detail) });
    model.addEventListener('model:loadedError', e => { this.renderError(e.target.err) });
    this.users = new Map;
  }
  renderLoading(loading) {
    console.log('ui/renderLoading', loading);
    this.renderMessage(loading ? 'Loading...' : '');
    if (loading) { this.renderError(null) }
  }
  renderUsers(users, { added, removed, updated }) {
    console.log('ui/renderUsers', { users, added, removed, updated });
    const ul = document.querySelector('.list.users');
    Array.from(this.users.keys()).forEach(id => { 
      if (removed.has(id)) {
        this.users.get(id).li.remove();
        this.users.delete(id);
      }
    });
    Array.from(this.users.keys()).forEach(id => { 
      if (updated.has(id)) {
        this.users.get(id).user = users.get(id);
        this.users.get(id).li.textContent = users.get(id).email;
      } 
    });
    Array.from(added.keys()).forEach(id => { 
      const user = users.get(id);
      const li = document.createElement('li');
      li.textContent = user.email;
      ul.appendChild(li);
      this.users.set(id, { user, li });
    });
  }
  renderError(error) {
    console.log('ui/renderError', error);
    const p = document.querySelector('.label.error');
    p.textContent = error?.message || '';
    p.style.display = error ? 'block' : 'none';
  }
  renderMessage(message) {
    console.log('ui/renderMessage', message);
    const p = document.querySelector('.label.message');
    p.textContent = message || '';
    p.style.display = message ? 'block' : 'none';
  }
}

//----------------------------------------------------------------------------------------
const config = () => ({
  backend: {
    baseUrl: 'http://localhost:8082/'
  }
});

//----------------------------------------------------------------------------------------
const model = new Model();
const ui = new Ui(model);

function windowLoad() {
  document.querySelector('.btn.load')
    .addEventListener('click', loadClick);
}

function loadClick() {
  console.log('loadClick');
  loadUsers(model);
}

window.addEventListener('load', windowLoad);

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
class UsersDb {
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
class UsersIDb {
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
class Actions extends EventTarget {
  constructor(services) {
    super();
    this.services = services;
  }
  load() {
    console.log('actions/load');
  
    this.dispatchEvent(new CustomEvent('actions:load-started'));
  
    const f = this.services.db.users().then(users => ({ users, kind: 'fetched' }));
    const r = this.services.idb.users().then(users => ({ users, kind: 'persisted' }));
  
    Promise.all([f, r])
      .then(([{ users: dbUsers }, { users: idbUsers }]) => {
        const idbIds = new Set(idbUsers.map(({ id }) => id));
        const dbIds = new Set(dbUsers.map(({ id }) => id));
        const removed = diffSet(idbIds, dbIds);
        this.services.idb.deleteUsers(removed);
        this.services.idb.putUsers(dbUsers);
      });
  
    Promise.any([f, r])
      .then(({ users, kind }) => {
        if (kind === 'persisted') { 
          this.dispatchEvent(new CustomEvent('actions:load-users', { detail: { users } }));
        }
        return f;
      })
      .then(({ users }) => { 
        this.dispatchEvent(new CustomEvent('actions:load-users', { detail: { users } }));
      })
      .catch(error => { 
        this.dispatchEvent(new CustomEvent('actions:load-error', { detail: { error } }));
      })
      .then(() => {
        this.dispatchEvent(new CustomEvent('actions:load-complete'));
      });
  }
}

//----------------------------------------------------------------------------------------
class Model extends EventTarget {
  constructor() {
    super();
    this.users = new Map;
  }
  setUsers(data) {
    console.log('model/setUsers', data);
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
      this.dispatchEvent(new CustomEvent('model:users-changed', { detail: { added, removed, updated } }));
    }
  }
}

//----------------------------------------------------------------------------------------
class Btn {
  constructor(sel) {
    this.el = document.querySelector(sel);
    this.addEventListener = this.el.addEventListener.bind(this.el);
  }
}

class Label {
  constructor(sel) {
    this.el = document.querySelector(sel);
  }
  render(text) {
    this.el.textContent = text || '';
    this.el.style.display = text ? 'block' : 'none';
  }
}

class List {
  constructor(sel) {
    this.el = document.querySelector(sel);
  }
}

class UsersList extends List {
  constructor(sel) {
    super(sel);
    this.users = new Map;
  }
  render(users, { added, removed, updated }) {
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
      this.el.appendChild(li);
      this.users.set(id, { user, li });
    });
  }
}

class Ui {
  constructor() {
    this.load = new Btn('.btn.load');
    this.message = new Label('.label.message');
    this.error = new Label('.label.error');
    this.users = new UsersList('.list.users');
  }
}
//----------------------------------------------------------------------------------------
class App {
  constructor(config) {
    this.config = config;
    this.services = {
      db: new UsersDb(this.config.db),
      idb: new UsersIDb()
    }
    this.model = new Model();
    this.ui = new Ui();
    this.actions = new Actions(this.services);

    this.ui.load.addEventListener('click', () => { this.actions.load() });

    this.actions.addEventListener('actions:load-started', () => { this.ui.message.render('Loading...') });
    this.actions.addEventListener('actions:load-users', (e) => { this.model.setUsers(e.detail.users) });
    this.actions.addEventListener('actions:load-error', (e) => { this.ui.error.render(e.detail.error?.message) });
    this.actions.addEventListener('actions:load-complete', () => { this.ui.message.render() });

    this.model.addEventListener('model:users-changed', (e) => { this.ui.users.render(e.target.users, e.detail) });
  }
}

//----------------------------------------------------------------------------------------
const config = () => ({
  db: {
    baseUrl: 'https://spamfro.xyz:8082/api/v1/'
  }
});

//----------------------------------------------------------------------------------------
window.addEventListener('load', () => { window.app = new App(config()) });

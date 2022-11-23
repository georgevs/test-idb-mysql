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
class Actions {
  constructor(services) {
    const target = new EventTarget();
    this.addEventListener = target.addEventListener.bind(target);
    this.dispatchEvent = target.dispatchEvent.bind(target);
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
  addUser({ email, fullName}) {
    console.log('actions/add-user', { email, fullName });
  }
}

//----------------------------------------------------------------------------------------
class Model {
  constructor() {
    const target = new EventTarget();
    this.addEventListener = target.addEventListener.bind(target);
    this.dispatchEvent = target.dispatchEvent.bind(target);
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
      this.dispatchEvent(new CustomEvent('model:users-changed', { detail: { users: { all: this.users, added, removed, updated } } }));
    }
  }
}

//----------------------------------------------------------------------------------------
class Element {
  constructor(sel, parent) {
    this.el = (parent ?? document).querySelector(sel);
    this.addEventListener = this.el.addEventListener.bind(this.el);
    this.dispatchEvent = this.el.dispatchEvent.bind(this.el);
    this.querySelector = this.el.querySelector.bind(this.el);
  }
}
class Btn extends Element { }
class Form extends Element { }
class Input extends Element { }
class Edit extends Input { }
class List extends Element { }

class Label extends Element {
  render(text) {
    this.el.textContent = (text || '').toString();
    this.el.style.display = text ? 'block' : 'none';
  }
}

//----------------------------------------------------------------------------------------
class UsersList extends List {
  constructor(sel) {
    super(sel);
    this.users = new Map;
  }
  render({ all, added, removed, updated }) {
    console.log({ all, added, removed, updated });
    Array.from(this.users.keys()).forEach(id => { 
      if (removed.has(id)) {
        this.users.get(id).li.remove();
        this.users.delete(id);
      }
    });
    Array.from(this.users.keys()).forEach(id => { 
      if (updated.has(id)) {
        this.users.get(id).user = all.get(id);
        this.users.get(id).li.textContent = all.get(id).email;
      } 
    });
    Array.from(added.keys()).forEach(id => { 
      const user = all.get(id);
      const li = document.createElement('li');
      li.textContent = user.email;
      this.el.appendChild(li);
      this.users.set(id, { user, li });
    });
  }
}

class AddUserForm extends Form { 
  constructor(sel) {
    super(sel);
    this.editEmail = new Edit('.edit.email', this);
    this.editFullName = new Edit('.edit.full-name', this);
    this.btnSbmit = new Btn('.btn.submit', this);
    this.btnCancel = new Btn('.btn.cancel', this);

    this.btnCancel.addEventListener('click', (e) => { e.preventDefault(); this.cancel() });
    this.addEventListener('submit', (e) => { e.preventDefault(); this.submit() });
  }
  show(visible) {
    this.el.style.display = visible ? 'block' : 'none'; 
  }
  cancel(e) {
    this.dispatchEvent(new CustomEvent('add-user:cancel'));
  }
  submit() {
    const email = this.editEmail.el.value;
    const fullName = this.editFullName.el.value;
    if (this.verify({ email, fullName })) {
      this.dispatchEvent(new CustomEvent('add-user:submit', { detail: { email, fullName } }));
    }
  }
  verify({ email, fullName }) {
    return true; // todo
  }
}

class Ui {
  constructor() {
    const target = new EventTarget();
    this.addEventListener = target.addEventListener.bind(target);
    this.dispatchEvent = target.dispatchEvent.bind(target);

    this.btnAdd = new Btn('.btn.add');
    this.btnLoad = new Btn('.btn.load');
    this.labelMessage = new Label('.label.message');
    this.labelError = new Label('.label.error');
    this.listUsers = new UsersList('.list.users');
    this.formAddUser = new AddUserForm('.form.add-user');

    this.btnLoad.addEventListener('click', () => { this.dispatchEvent(new CustomEvent('ui:load')) });
    this.btnAdd.addEventListener('click', () => { this.showAddUser(true) });
    this.formAddUser.addEventListener('add-user:cancel', () => { this.showAddUser(false) });
    this.formAddUser.addEventListener('add-user:submit', (e) => { this.submitAddUser(e.detail) });
  }
  showAddUser(visible) {
    this.btnAdd.el.style.display = visible ? 'none' : 'inline-block';
    this.formAddUser.show(visible);
  }
  submitAddUser(detail) {
    this.showAddUser(false);
    this.dispatchEvent(new CustomEvent('ui:add-user', { detail }));
  }
  render({ message, error, users }) {
    if (message !== undefined) { this.labelMessage.render(message) }
    if (error !== undefined) { this.labelError.render(error) }
    if (users !== undefined) { this.listUsers.render(users) }
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

    this.ui.addEventListener('ui:load', () => { this.actions.load() });
    this.ui.addEventListener('ui:add-user', (e) => { this.actions.addUser(e.detail) });

    this.actions.addEventListener('actions:load-started', () => { this.ui.render({ message: 'Loading...', error: '' }) });
    this.actions.addEventListener('actions:load-users', (e) => { this.model.setUsers(e.detail.users) });
    this.actions.addEventListener('actions:load-error', (e) => { this.ui.render({ error: e.detail.error?.message }) });
    this.actions.addEventListener('actions:load-complete', () => { this.ui.render({ message: '' }) });

    this.model.addEventListener('model:users-changed', (e) => { this.ui.render({ users: e.detail.users }) });
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

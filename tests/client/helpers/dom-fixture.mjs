export class TestElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.style = {
      properties: new Map(),
      setProperty: (name, value) => this.style.properties.set(name, value),
    };
    this.classNames = new Set();
    this.classList = {
      add: (name) => this.classNames.add(name),
      remove: (name) => this.classNames.delete(name),
      contains: (name) => this.classNames.has(name),
      toggle: (name, force) => {
        const add = force === undefined ? !this.classNames.has(name) : force;
        if (add) this.classNames.add(name);
        else this.classNames.delete(name);
        return add;
      },
    };
    this.isConnected = true;
    this.clientWidth = 600;
    this.offsetWidth = 180;
    this.offsetHeight = 80;
    this.text = "";
  }

  get className() {
    return [...this.classNames].join(" ");
  }
  set className(value) {
    this.classNames = new Set(String(value).split(/\s+/).filter(Boolean));
  }
  get textContent() {
    return (
      this.text +
      this.children
        .map((child) => (typeof child === "string" ? child : child.textContent))
        .join("")
    );
  }
  set textContent(value) {
    this.text = String(value);
    this.children = [];
  }

  append(...children) {
    for (const child of children) {
      if (child instanceof TestElement) child.parentNode = this;
      this.children.push(child);
    }
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }
  dispatch(name) {
    const event = {
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.propagationStopped = true;
      },
    };
    for (const listener of this.listeners.get(name) ?? []) listener(event);
    return event;
  }
  remove() {
    this.isConnected = false;
    if (this.parentNode)
      this.parentNode.children = this.parentNode.children.filter(
        (child) => child !== this,
      );
  }
  scrollIntoView() {}
  getBoundingClientRect() {
    return {
      left: 10,
      right: 190,
      top: 20,
      bottom: 40,
      width: 180,
      height: 20,
    };
  }
}

export function createDomFixture({
  querySelector = () => null,
  querySelectorAll = () => [],
} = {}) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const body = new TestElement("body");
  const document = {
    body,
    createElement: (tagName) => new TestElement(tagName),
    querySelector,
    querySelectorAll,
  };
  globalThis.document = document;
  globalThis.window = { innerWidth: 800, innerHeight: 600 };
  return {
    body,
    document,
    restore() {
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    },
  };
}


const listeners = [];
const callbackListeners = new Map();

function addListener(condition, action, type = 'message') {
  if (type === 'callback_query') {
    const listenerId = Date.now().toString() + Math.random().toString(36).substring(2);
    const listener = { condition, action };
    callbackListeners.set(listenerId, listener);
    return () => callbackListeners.delete(listenerId);
  } else {
    const listener = { condition, action };
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    };
  }
}

module.exports = { addListener, listeners, callbackListeners };
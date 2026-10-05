chrome.storage.local.get(["pendingQueue"], (result) => {
  const queue = result.pendingQueue || [];
  const el = document.getElementById("queue-count");
  if (el) el.innerText = `${queue.length} items`;
});

document.getElementById('board').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('standalone/board.html') });
document.getElementById('opts').onclick = () => chrome.runtime.openOptionsPage();

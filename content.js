(function() {
    'use strict';

    if (document.getElementById('ai-nav-container')) return;

    // --- 0. 策略定义 (回归基础，不再纠结侧边栏) ---
    const STRATEGIES = {
        gemini: {
            name: 'Gemini',
            querySelector: 'user-query, .user-query, [data-message-id]', 
            getText: (node) => node.textContent.trim(),
            getTitle: () => {
                // 默认策略：取网页标题，如果标题是默认的，就取第一句提问
                let docTitle = document.title.replace(/ - Google Gemini/g, '').replace(/Gemini/g, '').trim();
                if (docTitle && docTitle !== 'Google' && docTitle !== '') return docTitle;
                
                const firstQuery = document.querySelector('user-query, .user-query, [data-message-id]');
                if (firstQuery) {
                    const text = firstQuery.textContent.trim();
                    return text.substring(0, 15) + (text.length > 15 ? '...' : '');
                }
                return '新对话 ' + new Date().toLocaleTimeString();
            }
        },
        chatgpt: {
            name: 'ChatGPT',
            querySelector: '[data-message-author-role="user"]',
            getText: (node) => node.textContent.trim(),
            getTitle: () => {
                let docTitle = document.title.trim();
                const genericNames = ['ChatGPT', 'New chat', 'New Chat'];
                if (docTitle && !genericNames.includes(docTitle)) return docTitle;

                const firstQuery = document.querySelector('[data-message-author-role="user"]');
                if (firstQuery) {
                     const text = firstQuery.textContent.trim();
                     return text.substring(0, 15) + (text.length > 15 ? '...' : '');
                }
                return '新对话 ' + new Date().toLocaleTimeString();
            }
        }
    };

    let currentStrategy = null;
    const host = window.location.hostname;
    if (host.includes('gemini.google')) currentStrategy = STRATEGIES.gemini;
    else if (host.includes('chatgpt.com') || host.includes('openai.com')) currentStrategy = STRATEGIES.chatgpt;
    else return;

    // --- 1. 状态与存储 ---
    const THEME_KEY = 'ai_nav_theme_mode';
    const BOOKMARK_KEY = 'ai_nav_global_bookmarks';
    
    let currentThemeMode = localStorage.getItem(THEME_KEY) || 'auto';
    let activeTab = 'current'; 
    let lastQueryCount = -1;

    const loadBookmarks = () => {
        try { return JSON.parse(localStorage.getItem(BOOKMARK_KEY)) || []; } catch(e) { return []; }
    };
    const saveBookmarks = (list) => localStorage.setItem(BOOKMARK_KEY, JSON.stringify(list));

    // --- 2. 样式注入 ---
    const styleTag = document.createElement('style');
    styleTag.textContent = `
        :root {
            --nav-bg: 30, 31, 32; --nav-text: #e3e3e3; --nav-border: #555;
            --nav-item-bg: rgba(255, 255, 255, 0.03); --nav-item-hover: rgba(255, 255, 255, 0.1);
            --nav-accent: #8ab4f8; --icon-color: #aaa; --icon-hover: #fff;
            --tab-inactive: #888; --tab-active: #fff;
            --del-color: #ff6b6b; --edit-color: #f4b400;
        }
        [data-ai-theme="light"] {
            --nav-bg: 248, 249, 250; --nav-text: #1f1f1f; --nav-border: #d0d7de;
            --nav-item-bg: rgba(0, 0, 0, 0.03); --nav-item-hover: rgba(0, 0, 0, 0.08);
            --nav-accent: #0056b3; --icon-color: #666; --icon-hover: #000;
            --tab-inactive: #999; --tab-active: #000;
        }
        #ai-nav-container { font-family: sans-serif; transition: background 0.3s, border 0.3s; font-size: 13px; line-height: 1.4; }
        
        #ai-nav-drag-area { padding: 8px 10px; background: rgba(255,255,255,0.02); display: flex; justify-content: space-between; align-items: center; cursor: move; border-bottom: 1px solid var(--nav-border); user-select: none; }
        .nav-controls { display: flex; gap: 8px; align-items: center; }
        .icon-btn { cursor: pointer; font-size: 14px; color: var(--icon-color); transition: transform 0.2s, color 0.2s; }
        .icon-btn:hover { color: var(--icon-hover); transform: scale(1.1); }
        
        .nav-tabs { display: flex; border-bottom: 1px solid var(--nav-border); background: rgba(0,0,0,0.1); }
        .nav-tab { flex: 1; text-align: center; padding: 8px 0; cursor: pointer; color: var(--tab-inactive); font-weight: 500; transition: all 0.2s; user-select: none; }
        .nav-tab:hover { color: var(--tab-active); background: rgba(255,255,255,0.05); }
        .nav-tab.active { color: var(--nav-accent); border-bottom: 2px solid var(--nav-accent); }
        
        .nav-item { display: flex; align-items: center; justify-content: space-between; padding: 8px; margin-bottom: 4px; color: var(--nav-text); background: var(--nav-item-bg); border-radius: 6px; cursor: pointer; transition: background 0.2s; border-left: 3px solid transparent; }
        .nav-item:hover { background: var(--nav-item-hover); border-left: 3px solid var(--nav-accent); }
        .nav-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-right: 8px; }
        
        /* 按钮组 */
        .item-actions { display: flex; gap: 6px; opacity: 0.6; transition: opacity 0.2s; }
        .nav-item:hover .item-actions { opacity: 1; }
        
        .action-btn { font-size: 12px; padding: 2px 4px; border-radius: 3px; cursor: pointer; }
        .edit-btn { color: var(--icon-color); }
        .edit-btn:hover { background: var(--edit-color); color: #000; }
        .del-btn { color: var(--icon-color); }
        .del-btn:hover { background: var(--del-color); color: #fff; }

        /* 编辑框样式 */
        .edit-input { flex: 1; background: rgba(0,0,0,0.2); border: 1px solid var(--nav-accent); color: var(--nav-text); font-size: 12px; padding: 2px 4px; border-radius: 4px; outline: none; margin-right: 6px; }

        #ai-nav-list::-webkit-scrollbar { width: 5px; height: 5px; }
        #ai-nav-list::-webkit-scrollbar-thumb { background: #888; border-radius: 3px; }
    `;
    document.head.appendChild(styleTag);

    // --- 3. DOM 构建 ---
    const container = document.createElement('div');
    container.id = 'ai-nav-container';
    container.setAttribute('data-ai-theme', 'dark');

    const getThemeIcon = (mode) => {
        if (mode === 'auto') return '🌗';
        if (mode === 'dark') return '🌙';
        if (mode === 'light') return '☀️';
        return '🌗';
    };

    container.innerHTML = `
        <div id="ai-nav-drag-area">
            <span style="font-weight:bold; color:var(--nav-text)">${currentStrategy.name} 助手</span>
            <div class="nav-controls">
                <span id="save-chat-btn" class="icon-btn" title="收藏当前对话">★ 收藏</span>
                <span style="width:1px; background:var(--nav-border); height:14px; margin:0 4px;"></span>
                <span id="theme-toggle-btn" class="icon-btn" title="切换主题">${getThemeIcon(currentThemeMode)}</span>
                <span id="nav-refresh-btn" class="icon-btn" title="刷新列表">↻</span>
            </div>
        </div>
        <div class="nav-tabs">
            <div class="nav-tab active" id="tab-current">当前大纲</div>
            <div class="nav-tab" id="tab-bookmarks">收藏对话</div>
        </div>
        <div id="ai-nav-list" style="flex: 1; overflow-y: auto; padding: 8px;"></div>
        <div style="position: absolute; bottom: 0; right: 0; width: 15px; height: 15px; cursor: se-resize;"></div>
    `;

    container.style.cssText = `
        position: fixed; top: 80px; right: 20px; width: 240px; height: 400px;
        background: rgba(var(--nav-bg), 0.95); border: 1px solid var(--nav-border); 
        border-radius: 12px; z-index: 9999; display: flex; flex-direction: column;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2); backdrop-filter: blur(5px);
        resize: both; overflow: hidden;
    `;
    
    document.body.appendChild(container);

    // --- 4. 核心逻辑 ---
    const listElement = document.getElementById('ai-nav-list');
    const tabCurrent = document.getElementById('tab-current');
    const tabBookmarks = document.getElementById('tab-bookmarks');

    function switchTab(tab) {
        activeTab = tab;
        if (tab === 'current') {
            tabCurrent.classList.add('active');
            tabBookmarks.classList.remove('active');
            renderCurrentPageNav(true); 
        } else {
            tabCurrent.classList.remove('active');
            tabBookmarks.classList.add('active');
            renderBookmarks();
        }
    }
    tabCurrent.onclick = () => switchTab('current');
    tabBookmarks.onclick = () => switchTab('bookmarks');

    function renderCurrentPageNav(force = false) {
        if (activeTab !== 'current') return;
        const queries = Array.from(document.querySelectorAll(currentStrategy.querySelector));
        
        if (!force && queries.length === lastQueryCount) return;
        lastQueryCount = queries.length;

        listElement.innerHTML = '';
        if (queries.length === 0) {
            listElement.innerHTML = '<div style="padding:10px; opacity:0.6; text-align:center;">暂无提问...</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        queries.forEach((queryNode, index) => {
            const fullText = currentStrategy.getText(queryNode);
            if (!fullText) return;
            
            const item = document.createElement('div');
            item.className = 'nav-item';
            
            const textSpan = document.createElement('span');
            textSpan.className = 'nav-text';
            textSpan.textContent = `${index + 1}. ${fullText}`;
            item.title = fullText;

            item.appendChild(textSpan);
            item.onclick = () => {
                queryNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                queryNode.style.transition = 'opacity 0.3s';
                queryNode.style.opacity = '0.5';
                setTimeout(() => queryNode.style.opacity = '1', 300);
            };
            fragment.appendChild(item);
        });
        listElement.appendChild(fragment);
        if (force && listElement.scrollHeight > 0) listElement.scrollTop = listElement.scrollHeight;
    }

    // --- 渲染：收藏夹 (含编辑功能) ---
    function renderBookmarks() {
        if (activeTab !== 'bookmarks') return;
        listElement.innerHTML = '';
        const bookmarks = loadBookmarks();

        if (bookmarks.length === 0) {
            listElement.innerHTML = '<div style="padding:20px 10px; opacity:0.6; text-align:center;">暂无收藏<br><small>点击 "★ 收藏" 后<br>可手动编辑名称</small></div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        bookmarks.reverse().forEach((bk, index) => {
            const item = document.createElement('div');
            item.className = 'nav-item';
            
            // 文本区域 (默认显示)
            const linkSpan = document.createElement('span');
            linkSpan.className = 'nav-text';
            linkSpan.textContent = bk.title || '未命名对话';
            linkSpan.title = `${bk.title}\n(${bk.url})`;

            // 按钮组容器
            const actionDiv = document.createElement('div');
            actionDiv.className = 'item-actions';

            // 编辑按钮 (✎)
            const editBtn = document.createElement('span');
            editBtn.className = 'action-btn edit-btn';
            editBtn.textContent = '✎';
            editBtn.title = '重命名';
            
            // 删除按钮 (✕)
            const delBtn = document.createElement('span');
            delBtn.className = 'action-btn del-btn';
            delBtn.textContent = '✕';
            delBtn.title = '删除';

            // --- 编辑逻辑 ---
            editBtn.onclick = (e) => {
                e.stopPropagation(); // 防止跳转
                
                // 替换文本为输入框
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'edit-input';
                input.value = bk.title;
                
                // 替换 DOM
                item.replaceChild(input, linkSpan);
                input.focus();
                
                // 隐藏按钮组，避免干扰
                actionDiv.style.display = 'none';

                // 保存函数
                const doSave = () => {
                    const newTitle = input.value.trim();
                    if (newTitle) {
                        // 更新数据
                        const allBk = loadBookmarks();
                        // 因为是倒序显示的，需要找到原始数组对应的项
                        // 这里最稳妥的是根据 url 找 (假设 url 唯一)
                        const targetIndex = allBk.findIndex(b => b.url === bk.url);
                        if (targetIndex !== -1) {
                            allBk[targetIndex].title = newTitle;
                            saveBookmarks(allBk);
                        }
                    }
                    renderBookmarks(); // 重新渲染恢复原状
                };

                // 监听回车和失焦
                input.onkeydown = (ev) => {
                    if (ev.key === 'Enter') doSave();
                };
                input.onblur = doSave;
            };

            // --- 删除逻辑 ---
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if(confirm(`删除收藏 "${bk.title}"?`)) removeBookmark(bk.url);
            };

            actionDiv.appendChild(editBtn);
            actionDiv.appendChild(delBtn);

            item.appendChild(linkSpan);
            item.appendChild(actionDiv);

            // 点击条目跳转
            item.onclick = (e) => {
                // 如果正在编辑(有点 input 存在)，不跳转
                if (item.querySelector('input')) return;
                
                if (window.location.href === bk.url) alert('已在当前对话中');
                else window.location.href = bk.url;
            };
            
            fragment.appendChild(item);
        });
        listElement.appendChild(fragment);
    }

    // --- 交互事件 ---
    document.getElementById('save-chat-btn').addEventListener('click', () => {
        const title = currentStrategy.getTitle();
        const url = window.location.href;
        let bookmarks = loadBookmarks();
        
        if (bookmarks.find(b => b.url === url)) {
            switchTab('bookmarks'); 
            return;
        }
        
        bookmarks.push({ title, url, time: Date.now() });
        saveBookmarks(bookmarks);
        
        const btn = document.getElementById('save-chat-btn');
        const originalText = btn.textContent;
        btn.textContent = '✓ 已保存';
        setTimeout(() => btn.textContent = originalText, 1500);
        
        if (activeTab === 'bookmarks') renderBookmarks();
    });

    function removeBookmark(targetUrl) {
        let bookmarks = loadBookmarks();
        bookmarks = bookmarks.filter(b => b.url !== targetUrl);
        saveBookmarks(bookmarks);
        renderBookmarks();
    }

    document.getElementById('nav-refresh-btn').addEventListener('click', () => {
        lastQueryCount = -1; 
        if (activeTab === 'current') renderCurrentPageNav(true);
        else renderBookmarks();
    });

    function applyTheme() {
        const themeBtn = document.getElementById('theme-toggle-btn');
        themeBtn.textContent = getThemeIcon(currentThemeMode);
        
        let targetTheme = currentThemeMode;
        if (currentThemeMode === 'auto') {
            const bgColor = window.getComputedStyle(document.body).backgroundColor;
            const rgb = bgColor.match(/\d+/g);
            if (rgb) {
                const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
                targetTheme = brightness > 140 ? 'light' : 'dark';
            }
        }
        if (container.getAttribute('data-ai-theme') !== targetTheme) {
            container.setAttribute('data-ai-theme', targetTheme);
        }
    }

    document.getElementById('theme-toggle-btn').addEventListener('click', () => {
        if (currentThemeMode === 'auto') currentThemeMode = 'dark';
        else if (currentThemeMode === 'dark') currentThemeMode = 'light';
        else currentThemeMode = 'auto';
        localStorage.setItem(THEME_KEY, currentThemeMode);
        applyTheme();
    });

    let isDragging = false, startX, startY, initialLeft, initialTop;
    const dragArea = document.getElementById('ai-nav-drag-area');
    
    dragArea.addEventListener('mousedown', (e) => {
        // 关键修复：允许拖动标题，只屏蔽按钮区域(.nav-controls)和输入框
        // 使用 closest 方法检查点击目标是否在控制区内
        if (e.target.closest('.nav-controls') || e.target.tagName === 'INPUT') return;
        
        // 关键修复：防止文本选中导致拖动中断
        e.preventDefault();

        isDragging = true;
        startX = e.clientX; startY = e.clientY;
        const rect = container.getBoundingClientRect();
        initialLeft = rect.left; initialTop = rect.top;
        
        // 切换为 left/top 定位，防止 right/bottom 干扰
        container.style.right = 'auto'; container.style.bottom = 'auto';
        container.style.width = rect.width + 'px'; container.style.height = rect.height + 'px';
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
    function onMouseMove(e) { 
        if(isDragging) { 
            container.style.left = (initialLeft + e.clientX - startX) + 'px'; 
            container.style.top = (initialTop + e.clientY - startY) + 'px'; 
        }
    }
    function onMouseUp() { 
        isDragging = false; 
        document.removeEventListener('mousemove', onMouseMove); 
        document.removeEventListener('mouseup', onMouseUp); 
    }

    const observer = new MutationObserver((mutations) => {
        const isSelfMutation = mutations.every(m => container.contains(m.target));
        if (isSelfMutation) return;

        if (window.navTimeout) clearTimeout(window.navTimeout);
        window.navTimeout = setTimeout(() => {
            if (activeTab === 'current') renderCurrentPageNav(false);
        }, 2000);
    });
    
    observer.observe(document.body, { childList: true, subtree: true });

    setInterval(applyTheme, 3000);

    setTimeout(() => {
        renderCurrentPageNav(true);
        applyTheme();
    }, 1500);

})();

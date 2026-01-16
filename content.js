(function() {
    'use strict';

    if (document.getElementById('ai-nav-container')) return;

    // --- 0. 辅助函数 ---
    function cleanTitle(text) { return text ? text.replace(/[\n\r]+/g, ' ').trim() : null; }

    // --- 1. 策略定义 ---
    const STRATEGIES = {
        gemini: {
            name: 'Gemini',
            querySelector: 'user-query, .user-query, [data-message-id]', 
            getText: (node) => node.textContent.trim(),
            getTitle: () => {
                let docTitle = document.title.replace(/ - Google Gemini/g, '').replace(/Gemini/g, '').trim();
                if (docTitle && docTitle !== 'Google' && docTitle !== '') return docTitle;
                const first = document.querySelector('user-query, .user-query, [data-message-id]');
                return first ? (first.textContent.trim().substring(0, 15) + '...') : '新对话';
            }
        },
        chatgpt: {
            name: 'ChatGPT',
            querySelector: '[data-message-author-role="user"]',
            getText: (node) => node.textContent.trim(),
            getTitle: () => {
                let docTitle = document.title.trim();
                if (docTitle && !['ChatGPT', 'New chat'].includes(docTitle)) return docTitle;
                const first = document.querySelector('[data-message-author-role="user"]');
                return first ? (first.textContent.trim().substring(0, 15) + '...') : '新对话';
            }
        },
        // --- DeepSeek 策略 (已针对你提供的 HTML 优化) ---
        deepseek: {
            name: 'DeepSeek',
            // 增加 .fbb737a4 和 .ds-message (配合父级筛选)
            querySelector: '.fbb737a4, .ds-user-message, [data-role="user"], .user-message', 
            getText: (node) => node.textContent.trim(),
            getTitle: () => {
                let docTitle = document.title.replace('DeepSeek', '').trim();
                if (docTitle && docTitle !== 'New Chat') return docTitle;
                // 优先尝试抓取那个特定的 hash 类名
                const first = document.querySelector('.fbb737a4, .ds-user-message, [data-role="user"]');
                return first ? (first.textContent.trim().substring(0, 15) + '...') : '新对话';
            }
        }
    };

    let currentStrategy = null;
    const host = window.location.hostname;
    if (host.includes('gemini.google')) currentStrategy = STRATEGIES.gemini;
    else if (host.includes('chatgpt.com') || host.includes('openai.com')) currentStrategy = STRATEGIES.chatgpt;
    else if (host.includes('deepseek.com')) currentStrategy = STRATEGIES.deepseek;
    else return;

    // --- 2. 状态管理 ---
    const THEME_KEY = 'ai_nav_theme_mode';
    const BOOKMARK_KEY = 'ai_nav_global_bookmarks';
    const STATE_KEY = 'ai_nav_is_minimized';

    let currentThemeMode = localStorage.getItem(THEME_KEY) || 'auto';
    let isMinimized = localStorage.getItem(STATE_KEY) === 'true';
    let activeTab = 'current';
    let lastQueryCount = -1;
    let savedDimensions = { width: '240px', height: '400px' };

    const loadBookmarks = () => { try { return JSON.parse(localStorage.getItem(BOOKMARK_KEY)) || []; } catch(e){return[];} };
    const saveBookmarks = (list) => localStorage.setItem(BOOKMARK_KEY, JSON.stringify(list));

    // --- 3. 样式注入 ---
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
        
        #ai-nav-container { font-family: sans-serif; transition: width 0.2s, height 0.2s, border-radius 0.2s, opacity 0.2s; font-size: 13px; line-height: 1.4; overflow: hidden; }
        
        #ai-nav-container.minimized {
            width: 48px !important;
            height: 48px !important;
            border-radius: 50% !important;
            overflow: hidden !important;
            cursor: pointer;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            border: 2px solid var(--nav-accent) !important;
        }
        
        .minimized-icon {
            display: none; width: 100%; height: 100%;
            align-items: center; justify-content: center;
            font-size: 24px; color: var(--nav-text); background: rgba(var(--nav-bg), 0.9);
            user-select: none;
        }
        #ai-nav-container.minimized .minimized-icon { display: flex; }
        #ai-nav-container.minimized #ai-nav-main-content { display: none; }

        #ai-nav-main-content { display: flex; flex-direction: column; height: 100%; }

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
        
        .item-actions { display: flex; gap: 6px; opacity: 0.6; transition: opacity 0.2s; }
        .nav-item:hover .item-actions { opacity: 1; }
        .action-btn { font-size: 12px; padding: 2px 4px; border-radius: 3px; cursor: pointer; }
        .edit-btn:hover { background: var(--edit-color); color: #000; }
        .del-btn:hover { background: var(--del-color); color: #fff; }
        .edit-input { flex: 1; background: rgba(0,0,0,0.2); border: 1px solid var(--nav-accent); color: var(--nav-text); font-size: 12px; padding: 2px 4px; border-radius: 4px; outline: none; margin-right: 6px; }

        #ai-nav-list::-webkit-scrollbar { width: 5px; height: 5px; }
        #ai-nav-list::-webkit-scrollbar-thumb { background: #888; border-radius: 3px; }
    `;
    document.head.appendChild(styleTag);

    // --- 4. DOM 构建 ---
    const container = document.createElement('div');
    container.id = 'ai-nav-container';
    container.setAttribute('data-ai-theme', 'dark');
    if (isMinimized) container.classList.add('minimized');

    const getThemeIcon = (mode) => {
        if (mode === 'auto') return '🌗';
        if (mode === 'dark') return '🌙';
        if (mode === 'light') return '☀️';
        return '🌗';
    };

    container.innerHTML = `
        <div class="minimized-icon" title="点击展开">🤖</div>
        <div id="ai-nav-main-content">
            <div id="ai-nav-drag-area" title="双击标题栏最小化">
                <span style="font-weight:bold; color:var(--nav-text); pointer-events: none;">${currentStrategy.name} 助手</span>
                <div class="nav-controls">
                    <span id="save-chat-btn" class="icon-btn" title="收藏当前对话">★</span>
                    <span id="theme-toggle-btn" class="icon-btn" title="切换主题">${getThemeIcon(currentThemeMode)}</span>
                    <span id="minimize-btn" class="icon-btn" title="收起为悬浮球">－</span>
                </div>
            </div>
            <div class="nav-tabs">
                <div class="nav-tab active" id="tab-current">当前大纲</div>
                <div class="nav-tab" id="tab-bookmarks">收藏对话</div>
            </div>
            <div id="ai-nav-list" style="flex: 1; overflow-y: auto; padding: 8px;"></div>
            <div style="position: absolute; bottom: 0; right: 0; width: 15px; height: 15px; cursor: se-resize;" title="拖动改变大小"></div>
        </div>
    `;

    container.style.cssText = `
        position: fixed; top: 80px; right: 20px; width: 240px; height: 400px;
        background: rgba(var(--nav-bg), 0.95); border: 1px solid var(--nav-border); 
        border-radius: 12px; z-index: 9999; 
        box-shadow: 0 8px 24px rgba(0,0,0,0.2); backdrop-filter: blur(5px);
    `;
    
    document.body.appendChild(container);

    // --- 5. 核心逻辑 ---
    const listElement = document.getElementById('ai-nav-list');
    const tabCurrent = document.getElementById('tab-current');
    const tabBookmarks = document.getElementById('tab-bookmarks');
    const minimizedIcon = container.querySelector('.minimized-icon');

    function toggleMinimize(forceState) {
        if (typeof forceState !== 'undefined') isMinimized = forceState;
        else isMinimized = !isMinimized;
        
        if (isMinimized) {
            if (container.style.width && container.style.width !== '48px') {
                savedDimensions.width = container.style.width;
                savedDimensions.height = container.style.height;
            }
            container.classList.add('minimized');
            container.title = "拖动我移动 / 点击我展开";
            container.style.width = '';
            container.style.height = '';
        } else {
            container.classList.remove('minimized');
            container.title = "";
            container.style.width = savedDimensions.width;
            container.style.height = savedDimensions.height;
            if(activeTab === 'current') renderCurrentPageNav(true);
        }
        localStorage.setItem(STATE_KEY, isMinimized);
    }

    document.getElementById('minimize-btn').addEventListener('click', (e) => {
        e.stopPropagation(); toggleMinimize(true);
    });
    minimizedIcon.addEventListener('click', () => toggleMinimize(false));
    document.getElementById('ai-nav-drag-area').addEventListener('dblclick', () => toggleMinimize(true));


    function switchTab(tab) {
        activeTab = tab;
        if (tab === 'current') {
            tabCurrent.classList.add('active'); tabBookmarks.classList.remove('active');
            renderCurrentPageNav(true); 
        } else {
            tabCurrent.classList.remove('active'); tabBookmarks.classList.add('active');
            renderBookmarks();
        }
    }
    tabCurrent.onclick = () => switchTab('current');
    tabBookmarks.onclick = () => switchTab('bookmarks');

    function renderCurrentPageNav(force = false) {
        if (activeTab !== 'current' || isMinimized) return;
        // DeepSeek 使用你提供的类名 .fbb737a4
        const queries = Array.from(document.querySelectorAll(currentStrategy.querySelector));
        
        if (!force && queries.length === lastQueryCount) return;
        lastQueryCount = queries.length;
        listElement.innerHTML = '';
        if (queries.length === 0) {
            listElement.innerHTML = '<div style="padding:10px; opacity:0.6; text-align:center;">暂无提问...</div>'; return;
        }
        const frag = document.createDocumentFragment();
        queries.forEach((node, i) => {
            const txt = currentStrategy.getText(node);
            if (!txt) return;
            const item = document.createElement('div');
            item.className = 'nav-item';
            const span = document.createElement('span');
            span.className = 'nav-text';
            span.textContent = `${i + 1}. ${txt}`;
            item.title = txt;
            item.appendChild(span);
            item.onclick = () => {
                node.scrollIntoView({ behavior: 'smooth', block: 'center' });
                node.style.transition = 'opacity 0.3s'; node.style.opacity = '0.5';
                setTimeout(() => node.style.opacity = '1', 300);
            };
            frag.appendChild(item);
        });
        listElement.appendChild(frag);
        if (force && listElement.scrollHeight > 0) listElement.scrollTop = listElement.scrollHeight;
    }

    function renderBookmarks() {
        if (activeTab !== 'bookmarks') return;
        listElement.innerHTML = '';
        const bookmarks = loadBookmarks();
        if (bookmarks.length === 0) {
            listElement.innerHTML = '<div style="padding:20px 10px; opacity:0.6; text-align:center;">暂无收藏<br><small>点击 "★" 保存</small></div>'; return;
        }
        const frag = document.createDocumentFragment();
        bookmarks.reverse().forEach((bk) => {
            const item = document.createElement('div');
            item.className = 'nav-item';
            const span = document.createElement('span');
            span.className = 'nav-text';
            span.textContent = bk.title || '未命名对话';
            span.title = `${bk.title}\n(${bk.url})`;
            const actionDiv = document.createElement('div');
            actionDiv.className = 'item-actions';
            
            const editBtn = document.createElement('span');
            editBtn.className = 'action-btn edit-btn'; editBtn.textContent = '✎';
            editBtn.onclick = (e) => {
                e.stopPropagation();
                const input = document.createElement('input');
                input.className = 'edit-input'; input.value = bk.title;
                item.replaceChild(input, span); input.focus(); actionDiv.style.display = 'none';
                const save = () => {
                    const val = input.value.trim();
                    if(val) {
                        const all = loadBookmarks();
                        const idx = all.findIndex(b => b.url === bk.url);
                        if(idx!==-1) { all[idx].title = val; saveBookmarks(all); }
                    }
                    renderBookmarks();
                };
                input.onkeydown = (ev) => { if(ev.key === 'Enter') save(); };
                input.onblur = save;
            };

            const delBtn = document.createElement('span');
            delBtn.className = 'action-btn del-btn'; delBtn.textContent = '✕';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if(confirm(`删除 "${bk.title}"?`)) {
                    saveBookmarks(loadBookmarks().filter(b => b.url !== bk.url));
                    renderBookmarks();
                }
            };
            actionDiv.append(editBtn, delBtn);
            item.append(span, actionDiv);
            item.onclick = (e) => { if(!item.querySelector('input')) { if(window.location.href===bk.url)alert('已在当前对话'); else window.location.href=bk.url; } };
            frag.appendChild(item);
        });
        listElement.appendChild(frag);
    }

    document.getElementById('save-chat-btn').addEventListener('click', () => {
        const title = currentStrategy.getTitle();
        const url = window.location.href;
        let bks = loadBookmarks();
        if(bks.find(b=>b.url===url)) { switchTab('bookmarks'); return; }
        bks.push({title, url, time:Date.now()});
        saveBookmarks(bks);
        const btn = document.getElementById('save-chat-btn');
        const old = btn.textContent; btn.textContent = '✓';
        setTimeout(()=>btn.textContent=old, 1500);
        if(activeTab==='bookmarks') renderBookmarks();
    });

    function applyTheme() {
        const btn = document.getElementById('theme-toggle-btn');
        btn.textContent = getThemeIcon(currentThemeMode);
        let target = currentThemeMode;
        if(currentThemeMode==='auto') {
            const bg = window.getComputedStyle(document.body).backgroundColor;
            const rgb = bg.match(/\d+/g);
            if(rgb) target = (parseInt(rgb[0])*299+parseInt(rgb[1])*587+parseInt(rgb[2])*114)/1000 > 140 ? 'light' : 'dark';
        }
        if(container.getAttribute('data-ai-theme')!==target) container.setAttribute('data-ai-theme', target);
    }
    document.getElementById('theme-toggle-btn').addEventListener('click', () => {
        currentThemeMode = currentThemeMode==='auto'?'dark':(currentThemeMode==='dark'?'light':'auto');
        localStorage.setItem(THEME_KEY, currentThemeMode); applyTheme();
    });

    // --- 7. 拖拽逻辑 ---
    let isDragging = false, startX, startY, initialLeft, initialTop;
    
    const handleMouseDown = (e) => {
        if (!isMinimized && (e.target.closest('.nav-controls') || e.target.tagName === 'INPUT')) return;
        e.preventDefault();
        
        isDragging = true;
        startX = e.clientX; startY = e.clientY;
        const rect = container.getBoundingClientRect();
        initialLeft = rect.left; initialTop = rect.top;
        
        container.style.right = 'auto'; container.style.bottom = 'auto';
        container.style.left = rect.left + 'px'; 
        container.style.top = rect.top + 'px';

        if (!isMinimized) {
            container.style.width = rect.width + 'px'; 
            container.style.height = rect.height + 'px';
            savedDimensions.width = rect.width + 'px';
            savedDimensions.height = rect.height + 'px';
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    document.getElementById('ai-nav-drag-area').addEventListener('mousedown', handleMouseDown);
    minimizedIcon.addEventListener('mousedown', handleMouseDown);

    function onMouseMove(e) {
        if (!isDragging) return;
        container.style.left = (initialLeft + (e.clientX - startX)) + 'px';
        container.style.top = (initialTop + (e.clientY - startY)) + 'px';
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    // --- 8. 观察者 ---
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
        if (!isMinimized) renderCurrentPageNav(true);
        applyTheme();
    }, 1500);

})();

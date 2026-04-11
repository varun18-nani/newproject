import { auth, db, storage, googleProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, doc, setDoc, getDoc, updateDoc, ref, uploadBytes, getDownloadURL } from './firebase-config.js';

let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
    window.app = {}; // Export for HTML access
    const dashboard = document.getElementById('dashboard');
    const pathSelection = document.getElementById('path-selection');
    const roadmapContainer = document.getElementById('roadmap-container');
    const timelineContainer = document.getElementById('timeline-container');
    const backBtn = document.getElementById('back-to-dashboard');
    const jobGuideContent = document.getElementById('job-guide-content');
    const searchInput = document.getElementById('course-search');
    
    // Auth Elements
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    const mainNav = document.getElementById('main-nav');
    const homeView = document.getElementById('home-view');
    const getStartedBtn = document.getElementById('get-started');
    const loginForm = document.getElementById('login-form');
    const googleLogin = document.getElementById('google-login');
    const signOutBtn = document.getElementById('sign-out');
    const sidebarSignOutBtn = document.getElementById('sidebar-sign-out');
    const toggleRegister = document.getElementById('toggle-register');
    const navItems = document.querySelectorAll('.nav-item[data-view]');
    const viewSections = document.querySelectorAll('.view-section');
    
    // Feature Elements
    const quizList = document.getElementById('quiz-list');
    const roadmapEmptyState = document.getElementById('roadmap-empty-state');
    const roadmapActiveContent = document.getElementById('roadmap-active-content');
    
    const skillModal = document.getElementById('skill-modal');
    const closeModal = document.getElementById('close-modal');
    
    // Check if ROADMAP_DATA is available
    if (typeof ROADMAP_DATA === 'undefined') {
        console.error('Roadmap data not found!');
        return;
    }

    // --- State Management ---
    let currentPath = null;
    let userData = { scores: {}, completedSkills: [], profile: {}, videoProgress: {} };
    
    // Video Player State
    let ytPlayer = null;
    let currentVideoIndex = 0;
    let activePlaylist = [];
    let maxTimeWatched = 0;
    let antiSkipInterval = null;
    let isQuizActive = false;

    // --- Initialization ---
    function init() {
        setupEventListeners();
        checkAuth();
        setupTestModalListeners();
        setupProfileEditListeners();
        setupDiagnosticListeners();
        initVideoPlayerListeners();
        setupAntiCopyRestrictions();
    }

    function checkAuth() {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUser = user;
                try {
                    const snap = await getDoc(doc(db, 'users', user.uid));
                    if (snap.exists()) {
                        userData = snap.data();
                        if (!userData.scores) userData.scores = {};
                        if (!userData.completedSkills) userData.completedSkills = [];
                        if (!userData.profile) userData.profile = { name: user.displayName || 'User', email: user.email, goal: 'Not Set', photoURL: user.photoURL || '' };
                        if (!userData.videoProgress) userData.videoProgress = {};
                    } else {
                        userData = {
                            scores: {},
                            completedSkills: [],
                            profile: { name: user.displayName || 'User', email: user.email, goal: 'Not Set', photoURL: user.photoURL || '' },
                            videoProgress: {}
                        };
                        await setDoc(doc(db, 'users', user.uid), userData);
                    }
                    updateProfileUI();
                    showDashboard();
                } catch (e) {
                    console.error("Error fetching user data:", e);
                    showDashboard();
                }
            } else {
                currentUser = null;
                userData = { scores: {}, completedSkills: [], profile: {} };
                showHome();
            }
        });
    }

    function updateProfileUI() {
        const { name, email, goal, photoURL } = userData.profile;
        const nameVal = name || 'User';
        
        // Legacy IDs (keeping for backward compatibility if needed)
        const legacyName = document.getElementById('profile-name');
        if (legacyName) legacyName.textContent = nameVal;
        
        const legacyUserHeader = document.getElementById('ig-username-header');
        if (legacyUserHeader) legacyUserHeader.textContent = nameVal;

        // New Design IDs
        const newName = document.getElementById('profile-name-val');
        if (newName) newName.textContent = nameVal;

        const newTitle = document.getElementById('profile-title-val');
        if (newTitle) newTitle.textContent = goal || 'Career Goal Not Set';

        const newEmail = document.getElementById('profile-email-val');
        if (newEmail) newEmail.textContent = email || 'No Email Linked';
        
        // Avatar Logic
        const avatarNew = document.getElementById('profile-avatar-new');
        if (avatarNew) {
            if (photoURL) {
                avatarNew.style.backgroundImage = `url(${photoURL})`;
                avatarNew.style.backgroundSize = 'cover';
                avatarNew.style.backgroundPosition = 'center';
                avatarNew.textContent = '';
            } else {
                avatarNew.style.backgroundImage = 'none';
                avatarNew.textContent = name ? name.charAt(0).toUpperCase() : 'U';
            }
        }
        
        // Populate Skill Tags (Top 3 completed skills)
        const tagsContainer = document.getElementById('profile-skills-tags');
        if (tagsContainer) {
            const topSkills = userData.completedSkills.slice(0, 3);
            if (topSkills.length > 0) {
                tagsContainer.innerHTML = topSkills.map(s => `<span class="px-4 py-1.5 bg-[#e1e3de] text-[#5d605c] rounded-full text-sm font-medium">${s}</span>`).join('');
            } else {
                tagsContainer.innerHTML = `<span class="px-4 py-1.5 bg-[#e1e3de] text-[#5d605c] rounded-full text-sm font-medium">New Student</span>`;
            }
        }
    }

    function showHome() {
        loginView.classList.remove('active');
        dashboardView.style.display = 'none';
        mainNav.style.display = 'none';
        homeView.classList.add('active');
    }

    function showDashboard() {
        homeView.classList.remove('active');
        loginView.classList.remove('active');
        dashboardView.style.display = 'flex'; // Changed to flex for sidebar
        mainNav.style.display = 'flex';
        switchView('path-selection');
        updateProfileStats();
        renderPathSelection();
    }

    function switchView(viewId) {
        viewSections.forEach(section => {
            section.classList.toggle('active', section.id === viewId);
        });
        navItems.forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-view') === viewId);
        });

        if (viewId === 'quiz-view') renderQuizzes();
        if (viewId === 'profile-view') updateProfileStats();
        
        // Roadmap logic: show empty state if no path selected
        if (viewId === 'roadmap-container') {
            const hasActive = !!currentPath;
            roadmapEmptyState.style.display = hasActive ? 'none' : 'flex';
            roadmapActiveContent.style.display = hasActive ? 'block' : 'none';
        }
    }

    function showLogin() {
        homeView.classList.remove('active');
        loginView.classList.add('active');
        dashboardView.style.display = 'none';
        mainNav.style.display = 'none';
    }

    // --- Render Functions ---

    // Course-to-category gradient + icon mapping
    const COURSE_STYLES = {
        'data-science':      { gradient: 'linear-gradient(135deg, #1e3a5f, #0ea5e9)', icon: 'database', tag: 'Tech · Data' },
        'ai':                { gradient: 'linear-gradient(135deg, #1a1a2e, #6c3483)', icon: 'cpu', tag: 'Tech · AI' },
        'ml':                { gradient: 'linear-gradient(135deg, #1b3a4b, #00b4d8)', icon: 'brain-circuit', tag: 'Tech · ML' },
        'full-stack':        { gradient: 'linear-gradient(135deg, #1a1a1a, #f7931e)', icon: 'layers', tag: 'Tech · Web' },
        'cloud':             { gradient: 'linear-gradient(135deg, #0a2342, #2196f3)', icon: 'cloud', tag: 'Tech · Cloud' },
        'cyber-security':    { gradient: 'linear-gradient(135deg, #1a0a0a, #e53935)', icon: 'shield-check', tag: 'Tech · Security' },
        'devops':            { gradient: 'linear-gradient(135deg, #0f2027, #203a43)', icon: 'infinity', tag: 'Tech · DevOps' },
        'blockchain':        { gradient: 'linear-gradient(135deg, #1a1200, #f9a825)', icon: 'link-2', tag: 'Tech · Web3' },
        'software-testing':  { gradient: 'linear-gradient(135deg, #0a2a0a, #2e7d32)', icon: 'badge-check', tag: 'Tech · QA' },
        'dsa':               { gradient: 'linear-gradient(135deg, #1a0a2e, #7c3aed)', icon: 'binary', tag: 'Tech · CS' },
        'python':            { gradient: 'linear-gradient(135deg, #1a3020, #4caf50)', icon: 'code-2', tag: 'Tech · Programming' },
        'data-analytics':    { gradient: 'linear-gradient(135deg, #162032, #1976d2)', icon: 'bar-chart-2', tag: 'Tech · Analytics' },
        'ethical-hacking':   { gradient: 'linear-gradient(135deg, #0d0d0d, #43a047)', icon: 'terminal', tag: 'Tech · Security' },
        'iot':               { gradient: 'linear-gradient(135deg, #142030, #00acc1)', icon: 'radio', tag: 'Tech · IoT' },
        'mba':               { gradient: 'linear-gradient(135deg, #1a1200, #c0912a)', icon: 'briefcase', tag: 'Business · MBA' },
        'pgdm':              { gradient: 'linear-gradient(135deg, #200a0a, #c62828)', icon: 'graduation-cap', tag: 'Business · Mgmt' },
        'business-analytics':{ gradient: 'linear-gradient(135deg, #12171a, #0288d1)', icon: 'trending-up', tag: 'Business · Analytics' },
        'product-management':{ gradient: 'linear-gradient(135deg, #1a0a1a, #8e24aa)', icon: 'package', tag: 'Business · Product' },
        'digital-marketing': { gradient: 'linear-gradient(135deg, #1a0a0a, #e91e63)', icon: 'megaphone', tag: 'Business · Marketing' },
        'mtech':             { gradient: 'linear-gradient(135deg, #0a1a1a, #00897b)', icon: 'flask-conical', tag: 'Engineering · M.Tech' },
        'robotics':          { gradient: 'linear-gradient(135deg, #0d1117, #388e3c)', icon: 'bot', tag: 'Engineering · Robotics' },
        'embedded':          { gradient: 'linear-gradient(135deg, #1a1200, #ef6c00)', icon: 'circuit-board', tag: 'Engineering · Embedded' },
        'vlsi':              { gradient: 'linear-gradient(135deg, #1a0a2e, #5e35b1)', icon: 'cpu', tag: 'Engineering · VLSI' },
        'industrial-auto':   { gradient: 'linear-gradient(135deg, #1a1a0a, #afb42b)', icon: 'settings-2', tag: 'Engineering · Auto' },
        'renewable-energy':  { gradient: 'linear-gradient(135deg, #0a1a0a, #d84315)', icon: 'sun', tag: 'Engineering · Energy' },
        'cfa':               { gradient: 'linear-gradient(135deg, #0a0a1a, #1565c0)', icon: 'landmark', tag: 'Finance · CFA' },
        'frm':               { gradient: 'linear-gradient(135deg, #1a0d0a, #bf360c)', icon: 'shield-alert', tag: 'Finance · FRM' },
        'financial-modeling':{ gradient: 'linear-gradient(135deg, #0a1a12, #2e7d32)', icon: 'calculator', tag: 'Finance · Modeling' },
        'investment-banking':{ gradient: 'linear-gradient(135deg, #1a1205, #ff8f00)', icon: 'building-2', tag: 'Finance · IB' },
        'ui-ux':             { gradient: 'linear-gradient(135deg, #1a0a1a, #e91e63)', icon: 'pen-tool', tag: 'Design · UI/UX' },
        'graphic-design':    { gradient: 'linear-gradient(135deg, #1a0820, #7b1fa2)', icon: 'palette', tag: 'Design · Graphic' },
        'animation-vfx':     { gradient: 'linear-gradient(135deg, #0a0a1a, #0d47a1)', icon: 'clapperboard', tag: 'Design · VFX' },
        'video-editing':     { gradient: 'linear-gradient(135deg, #0d0d0d, #c62828)', icon: 'video', tag: 'Design · Video' },
        'upsc':              { gradient: 'linear-gradient(135deg, #0a1a0a, #1b5e20)', icon: 'scroll-text', tag: 'Exam · UPSC' },
        'gate':              { gradient: 'linear-gradient(135deg, #0a0a1a, #283593)', icon: 'clipboard-check', tag: 'Exam · GATE' },
        'ssc':               { gradient: 'linear-gradient(135deg, #1a1200, #e65100)', icon: 'file-check', tag: 'Exam · SSC' },
        'banking-exams':     { gradient: 'linear-gradient(135deg, #0a1a1a, #006064)', icon: 'piggy-bank', tag: 'Exam · Banking' },
        'ms-abroad':         { gradient: 'linear-gradient(135deg, #0d1a0d, #1b5e20)', icon: 'globe', tag: 'Study Abroad · MS' },
        'mba-abroad':        { gradient: 'linear-gradient(135deg, #1a0a08, #bf360c)', icon: 'plane', tag: 'Study Abroad · MBA' },
    };

    function renderPathSelection(filter = '') {
        dashboard.innerHTML = '';
        const keys = Object.keys(ROADMAP_DATA).filter(key => {
            const path = ROADMAP_DATA[key];
            const searchStr = `${path.title} ${path.description} ${key}`.toLowerCase();
            return searchStr.includes(filter.toLowerCase());
        });

        if (keys.length === 0) {
            dashboard.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--text-secondary);">
                    <i data-lucide="search-x" style="width: 48px; height: 48px; margin-bottom: 15px; opacity: 0.5;"></i>
                    <p>No career paths found matching your search.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        keys.forEach(key => {
            const path = ROADMAP_DATA[key];
            const style = COURSE_STYLES[key] || { gradient: 'linear-gradient(135deg, #1a1a2e, #6c3483)', icon: 'star', tag: 'Career Path' };
            const card = document.createElement('div');
            card.className = 'path-card';
            card.innerHTML = `
                <div class="card-banner" style="background: ${style.gradient};">
                    <i data-lucide="${style.icon}" class="card-banner-icon"></i>
                    <span class="card-tag">${style.tag}</span>
                </div>
                <div class="card-body">
                    <h3>${path.title}</h3>
                    <p>${path.description}</p>
                </div>
            `;
            card.onclick = () => handlePathSelection(key);
            dashboard.appendChild(card);
        });
        lucide.createIcons();
    }

    // =============================================
    // QUIZ QUESTIONS BANK (per-course, per-module)
    // =============================================
    const QUIZ_BANK = {
        'data-science': [
            [
                { q: "Which Python library is primarily used for data manipulation?", opts: ["NumPy", "Pandas", "Matplotlib", "Scikit-Learn"], ans: 1 },
                { q: "What does 'NaN' stand for in Pandas?", opts: ["Null and Nil", "Not a Number", "Nested Array Node", "None"], ans: 1 },
                { q: "Which of the following is a measure of central tendency?", opts: ["Variance", "Standard Deviation", "Mean", "Range"], ans: 2 },
                { q: "What is the output of arr.shape for a 3x4 numpy array?", opts: ["(12,)", "(3,4)", "(4,3)", "(3,)"], ans: 1 },
                { q: "Which function is used to read a CSV file in Pandas?", opts: ["pd.open()", "pd.load_csv()", "pd.read_csv()", "pd.import_csv()"], ans: 2 }
            ],[
                { q: "What does EDA stand for?", opts: ["Extreme Data Analysis", "Exploratory Data Analysis", "Empirical Data Algorithm", "Extended Data Aggregation"], ans: 1 },
                { q: "Which visualization library is built on top of Matplotlib?", opts: ["Plotly", "Bokeh", "Seaborn", "Altair"], ans: 2 },
                { q: "What is a DataFrame in Pandas?", opts: ["A single array", "A 2D labeled data structure", "A Python list", "A database schema"], ans: 1 },
                { q: "Which SQL command retrieves data from a table?", opts: ["INSERT", "DELETE", "SELECT", "UPDATE"], ans: 2 },
                { q: "What is data normalization?", opts: ["Deleting outliers", "Scaling features to a common range", "Adding missing values", "Sorting data"], ans: 1 }
            ],[
                { q: "What does overfitting mean in ML?", opts: ["Model performs well on new data", "Model memorizes training data but fails on new data", "Model has too few parameters", "Model is underfit"], ans: 1 },
                { q: "What is a hyperparameter?", opts: ["A parameter learned during training", "A configuration set before training", "A type of neural layer", "An output variable"], ans: 1 },
                { q: "Which technique reduces dimensionality?", opts: ["KNN", "PCA", "SVM", "GBM"], ans: 1 },
                { q: "What is Apache Spark primarily used for?", opts: ["Web development", "Mobile apps", "Large-scale data processing", "Image recognition"], ans: 2 },
                { q: "What is cross-validation used for?", opts: ["Data visualization", "Assessing model generalization", "Feature engineering", "Data cleaning"], ans: 1 }
            ]
        ],
        'dsa': [
            [
                { q: "What is the time complexity of binary search?", opts: ["O(n)", "O(n²)", "O(log n)", "O(1)"], ans: 2 },
                { q: "Which data structure uses LIFO?", opts: ["Queue", "Stack", "Heap", "Graph"], ans: 1 },
                { q: "What is an array index starting at?", opts: ["1", "0", "-1", "Depends on language"], ans: 1 },
                { q: "Which sorting algorithm has best average complexity?", opts: ["Bubble Sort", "Merge Sort", "Insertion Sort", "Selection Sort"], ans: 1 },
                { q: "What is a linked list node composed of?", opts: ["Only data", "Data and a pointer", "An index and value", "Key-value pair"], ans: 1 }
            ],[
                { q: "What is BFS used for in graphs?", opts: ["Shortest path in weighted graphs", "Shortest path in unweighted graphs", "Finding cycles", "Topological sort"], ans: 1 },
                { q: "Which data structure is a heap?", opts: ["A complete binary tree satisfying heap property", "A sorted array", "A hash table", "A doubly linked list"], ans: 0 },
                { q: "What does a hash function do?", opts: ["Sorts data", "Maps data to a fixed-size value", "Compresses data", "Encrypts data"], ans: 1 },
                { q: "What is the worst-case of Quicksort?", opts: ["O(n log n)", "O(n)", "O(n²)", "O(log n)"], ans: 2 },
                { q: "DFS uses which data structure?", opts: ["Queue", "Stack", "Array", "Heap"], ans: 1 }
            ],[
                { q: "What is memoization?", opts: ["Storing results of expensive calls to reuse", "Allocating memory", "Clearing cache", "Recursion technique"], ans: 0 },
                { q: "What is the 0/1 Knapsack problem solved with?", opts: ["Greedy", "Dynamic Programming", "BFS", "Binary Search"], ans: 1 },
                { q: "What is backtracking?", opts: ["A loop reset technique", "Trying all solutions and abandoning invalid ones", "Reversing a list", "A graph algorithm"], ans: 1 },
                { q: "Which problem uses Dijkstra's algorithm?", opts: ["Shortest path in weighted graph", "Cycle detection", "Topological sort", "Minimum spanning tree"], ans: 0 },
                { q: "What is the time complexity of merge sort?", opts: ["O(n²)", "O(n log n)", "O(log n)", "O(n)"], ans: 1 }
            ]
        ],
        'full-stack': [
            [
                { q: "What does HTML stand for?", opts: ["Hyper Text Markup Language", "High Text Machine Language", "Hyper Transfer Markup Loader", "Home Tool Markup Language"], ans: 0 },
                { q: "Which CSS property controls text size?", opts: ["text-size", "font-size", "text-scale", "letter-size"], ans: 1 },
                { q: "What does 'DOM' stand for?", opts: ["Document Object Model", "Data Object Module", "Display Output Method", "Document Order Manager"], ans: 0 },
                { q: "Which JS method selects an element by ID?", opts: ["querySelector", "getElementById", "getElementByClass", "findElement"], ans: 1 },
                { q: "What is CSS Flexbox used for?", opts: ["Animations", "Responsive layout design", "Font management", "Color schemes"], ans: 1 }
            ],[
                { q: "React is primarily a UI ___?", opts: ["Framework", "Library", "Database", "Server"], ans: 1 },
                { q: "What is Node.js?", opts: ["A browser", "A JavaScript runtime on the server", "A CSS framework", "A database"], ans: 1 },
                { q: "What does REST stand for?", opts: ["Rapid Endpoint Syntax Transfer", "Representational State Transfer", "Remote Execution State Terminal", "Resource Entity Service Transfer"], ans: 1 },
                { q: "Which Node.js framework is commonly used?", opts: ["Django", "Laravel", "Express", "Spring"], ans: 2 },
                { q: "What is npm?", opts: ["Node Procedure Manager", "Node Package Manager", "Net Protocol Module", "No-Platform Module"], ans: 1 }
            ],[
                { q: "What is SQL used for?", opts: ["Styling web pages", "Querying relational databases", "Writing server code", "Managing containers"], ans: 1 },
                { q: "What is Docker?", opts: ["A programming language", "A containerization platform", "A cloud provider", "A CSS tool"], ans: 1 },
                { q: "What is a primary key in a database?", opts: ["First column", "Unique identifier for each row", "Encrypted password", "Foreign reference"], ans: 1 },
                { q: "What does CI/CD stand for?", opts: ["Continuous Integration/Continuous Delivery", "Code Integration/Code Deployment", "Certified Interface/Certified Design", "Client Interface/Client Delivery"], ans: 0 },
                { q: "What is JWT used for?", opts: ["Styling", "Authentication & authorization tokens", "Database indexing", "CSS animations"], ans: 1 }
            ]
        ]
    };

    // Generic fallback questions for any course
    const GENERIC_QUIZ = level => [
        { q: `What is the most important skill at the ${level} stage?`, opts: ["Speed", "Deep understanding of fundamentals", "Memorization", "Copying code"], ans: 1 },
        { q: "What is the best approach when stuck on a problem?", opts: ["Give up", "Break it down into smaller steps", "Skip it entirely", "Ask immediately without trying"], ans: 1 },
        { q: "Which resource is most reliable for learning?", opts: ["Social media posts", "Official documentation", "Random blogs", "YouTube shorts only"], ans: 1 },
        { q: "What does consistent daily practice help with?", opts: ["Nothing", "Building strong long-term retention", "Only short-term memory", "Increasing stress"], ans: 1 },
        { q: "How should you approach a new module?", opts: ["Jump to advanced topics", "Start from basics and build up", "Only watch videos", "Skip theoretical concepts"], ans: 1 }
    ];

    function getQuizQuestions(pathKey, milestoneIndex) {
        const bank = QUIZ_BANK[pathKey];
        if (bank && bank[milestoneIndex]) return bank[milestoneIndex];
        const level = ROADMAP_DATA[pathKey]?.milestones[milestoneIndex]?.level || 'Intermediate';
        return GENERIC_QUIZ(level);
    }

    // =============================================
    // COURSE STYLE MAP (reused from card rendering)
    // =============================================
    function getCourseStyle(key) {
        return (typeof COURSE_STYLES !== 'undefined' && COURSE_STYLES[key]) ||
            { gradient: 'linear-gradient(135deg, #1a1a2e, #6c3483)', icon: 'star', tag: 'Career' };
    }

    // =============================================
    // PATH SELECTION & DIAGNOSTICS
    // =============================================
    function handlePathSelection(pathKey) {
        if (!currentUser) {
            showLogin();
            return;
        }
        
        if (userData.scores[pathKey] && Object.keys(userData.scores[pathKey]).length > 0) {
            showRoadmap(pathKey);
        } else {
            startDiagnosticTest(pathKey);
        }
    }

    let activeDiagState = { pathKey: null, questions: [], currentQ: 0, score: 0, selectedOpt: null };

    window.startDiagnosticTest = (pathKey) => {
        const pathData = ROADMAP_DATA[pathKey];
        // Use generic quiz or first module questions
        const questions = getQuizQuestions(pathKey, 0).slice(0, 5);
        activeDiagState = { pathKey, questions, currentQ: 0, score: 0, selectedOpt: null };

        document.getElementById('diag-modal-title').textContent = `${pathData.title} Placement Test`;
        document.getElementById('diag-q-count').textContent = questions.length;

        document.getElementById('diag-intro-state').style.display = 'block';
        document.getElementById('diag-question-state').style.display = 'none';
        document.getElementById('diag-result-state').style.display = 'none';
        document.getElementById('diagnostic-modal').style.display = 'flex';
        lucide.createIcons();
    };

    function renderDiagQuestion() {
        const { questions, currentQ } = activeDiagState;
        const q = questions[currentQ];
        const total = questions.length;

        document.getElementById('diag-q-progress').textContent = `${currentQ + 1} / ${total}`;
        document.getElementById('diag-q-fill').style.width = `${((currentQ + 1) / total) * 100}%`;
        document.getElementById('diag-question-text').textContent = q.q;

        const optContainer = document.getElementById('diag-options');
        optContainer.innerHTML = '';
        q.opts.forEach((opt, i) => {
            const btn = document.createElement('button');
            btn.className = 'test-option';
            btn.textContent = opt;
            btn.onclick = () => selectDiagOption(i);
            optContainer.appendChild(btn);
        });

        const nextBtn = document.getElementById('next-diag-btn');
        nextBtn.disabled = true;
        nextBtn.style.opacity = '0.4';
        nextBtn.textContent = currentQ < total - 1 ? 'Next Question' : 'See Results';
        activeDiagState.selectedOpt = null;
    }

    function selectDiagOption(selectedIndex) {
        const { questions, currentQ } = activeDiagState;
        const correct = questions[currentQ].ans;

        document.querySelectorAll('#diag-options .test-option').forEach((btn, i) => {
            btn.classList.remove('selected', 'correct', 'wrong');
            if (i === correct) btn.classList.add('correct');
            else if (i === selectedIndex && selectedIndex !== correct) btn.classList.add('wrong');
            btn.onclick = null;
        });

        if (selectedIndex === correct) activeDiagState.score++;
        activeDiagState.selectedOpt = selectedIndex;

        const nextBtn = document.getElementById('next-diag-btn');
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
    }

    function showDiagResults() {
        const { pathKey, questions, score } = activeDiagState;
        const pct = Math.round((score / questions.length) * 100);

        document.getElementById('diag-score-text').textContent = `${pct}%`;
        const circle = document.getElementById('diag-score-circle');
        circle.style.borderColor = pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';
        circle.style.background = pct >= 80 ? 'rgba(34,197,94,0.1)' : pct >= 60 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';

        let message;
        if (!userData.scores[pathKey]) userData.scores[pathKey] = {};
        
        if (pct >= 80) {
            message = `Great job! You scored ${pct}%. We've auto-mastered Module 1 for you!`;
            userData.scores[pathKey][0] = pct;
        } else {
            message = `You scored ${pct}%. We recommend starting from Module 1 to build a solid foundation.`;
        }

        if (currentUser) {
            updateDoc(doc(db, 'users', currentUser.uid), {
                [`scores.${pathKey}`]: userData.scores[pathKey]
            }).catch(e => console.error(e));
        }

        document.getElementById('diag-message').textContent = message;
        document.getElementById('diag-question-state').style.display = 'none';
        document.getElementById('diag-result-state').style.display = 'block';
    }

    // =============================================
    // SHOW ROADMAP — Visual Node Path
    // =============================================
    function showRoadmap(pathKey) {
        currentPath = pathKey;
        const pathData = ROADMAP_DATA[pathKey];
        const courseStyle = getCourseStyle(pathKey);
        const scores = userData.scores[pathKey] || {};

        // Set course header
        document.getElementById('roadmap-title').textContent = pathData.title;
        document.getElementById('roadmap-desc').textContent = pathData.description;

        const iconEl = document.getElementById('roadmap-course-icon');
        iconEl.style.background = courseStyle.gradient;
        iconEl.innerHTML = `<i data-lucide="${courseStyle.icon}"></i>`;

        // Calculate overall progress
        const totalModules = pathData.milestones.length;
        const completedModules = Object.keys(scores).length;
        const progressPct = Math.round((completedModules / totalModules) * 100);
        document.getElementById('roadmap-progress-fill').style.width = `${progressPct}%`;
        document.getElementById('roadmap-progress-label').textContent = `${progressPct}% Complete · ${completedModules}/${totalModules} modules`;

        // Render visual nodes
        renderVisualRoadmap(pathKey, pathData.milestones, scores);

        // Render adaptive schedule
        renderAdaptiveSchedule(pathKey, pathData.milestones, scores);

        // Render job guide
        renderJobGuide(pathData.job_guide);

        // Show roadmap views
        roadmapEmptyState.style.display = 'none';
        roadmapActiveContent.style.display = 'block';
        switchView('roadmap-container');

        // VIDEO PLAYER ENTRY: Show play button if playlist exists
        const playerBtn = document.getElementById('open-course-player');
        if (typeof PLAYLIST_DATA !== 'undefined' && PLAYLIST_DATA[pathKey]) {
            playerBtn.style.display = 'block';
            playerBtn.onclick = () => openCoursePlayer(pathKey);
        } else {
            playerBtn.style.display = 'none';
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // =============================================
    // RENDER VISUAL NODE PATH
    // =============================================
    function renderVisualRoadmap(pathKey, milestones, scores) {
        const container = document.getElementById('visual-roadmap');
        container.innerHTML = '';

        milestones.forEach((milestone, index) => {
            const score = scores[index];
            const isPassed = score !== undefined && score >= 80;
            const isPrevPassed = index === 0 || (scores[index - 1] !== undefined && scores[index - 1] >= 80);
            
            const isCompleted = isPassed;
            const isCurrent = !isPassed && isPrevPassed;
            const isLocked = !isPassed && !isPrevPassed;

            // Connector (skip first)
            if (index > 0) {
                const connector = document.createElement('div');
                const prevPassed = scores[index-1] !== undefined && scores[index-1] >= 80;
                connector.className = `roadmap-connector ${prevPassed ? 'connected' : ''}`;
                container.appendChild(connector);
            }

            // Node row
            const row = document.createElement('div');
            row.className = 'roadmap-node-row';

            const nodeClass = isCompleted ? 'completed' : isCurrent ? 'current' : 'locked';
            const numberIcon = isCompleted ? '✓' : isLocked ? '🔒' : index + 1;

            const skillPills = milestone.skills.map(s => {
                const done = userData.completedSkills.includes(s.name);
                return `<span class="node-skill-pill ${done ? 'done' : ''}">${done ? '✓ ' : ''}${s.name}</span>`;
            }).join('');

            let scoreBadgeHtml = '';
            if (score !== undefined) {
                const cls = score >= 80 ? 'score-excellent' : score >= 60 ? 'score-good' : 'score-needs-work';
                const icon = score >= 80 ? '🏆' : score >= 60 ? '📈' : '🔄';
                scoreBadgeHtml = `<span class="node-score-badge ${cls}">${icon} ${score}% score</span>`;
            }

            const testBtnLabel = isCompleted ? 'Retake to Improve' : score !== undefined ? 'Retake Module Test' : isCurrent ? '▶ Take Module Test' : '🔒 Locked';
            const testBtnDisabled = isLocked ? 'disabled' : '';

            row.innerHTML = `
                <div class="roadmap-node ${nodeClass} fade-in" style="animation-delay: ${index * 0.12}s">
                    <div class="node-number">${numberIcon}</div>
                    <div class="node-content">
                        <div class="node-level">${milestone.level}</div>
                        <div class="node-title">${milestone.title}</div>
                        <div class="node-skills-preview">${skillPills}</div>
                        <div class="node-actions">
                            <button class="take-test-btn" onclick="window.openModuleTest('${pathKey}', ${index})" ${testBtnDisabled}>
                                ${testBtnLabel}
                            </button>
                            ${scoreBadgeHtml}
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(row);
        });

        lucide.createIcons();
    }

    // =============================================
    // ADAPTIVE SCHEDULE GENERATOR
    // =============================================
    function renderAdaptiveSchedule(pathKey, milestones, scores) {
        const container = document.getElementById('schedule-weeks');
        const subtitle = document.querySelector('.schedule-subtitle');
        container.innerHTML = '';

        const hasAnyScore = Object.keys(scores).length > 0;
        if (!hasAnyScore) {
            subtitle.textContent = 'Complete module tests to unlock your personalized AI-powered learning schedule.';
            container.innerHTML = `<div style="color: var(--text-secondary); font-size: 0.88rem; padding: 10px 0;">
                No tests completed yet. Take the first module test to generate your schedule! 🚀
            </div>`;
            return;
        }

        subtitle.textContent = 'Based on your test performance, here is your optimal learning pace:';

        let weekNum = 1;
        milestones.forEach((milestone, index) => {
            const score = scores[index];

            // Determine weeks needed and status
            let weeksNeeded, status, statusLabel, pace;
            if (score === undefined) {
                weeksNeeded = 1; status = 'upcoming'; statusLabel = 'Upcoming';
                pace = 'Not started';
            } else if (score >= 80) {
                weeksNeeded = 1; status = 'on-track'; statusLabel = 'On Track 🏆';
                pace = '1 week — Excellent pace!';
            } else if (score >= 60) {
                weeksNeeded = 2; status = 'review'; statusLabel = 'Review Mode 📈';
                pace = '2 weeks — Review recommended';
            } else {
                weeksNeeded = 3; status = 'revisit'; statusLabel = 'Intensive 🔄';
                pace = '3 weeks — Module revisit needed';
            }

            const weekLabel = weeksNeeded === 1
                ? `Week ${weekNum}`
                : `Week ${weekNum}–${weekNum + weeksNeeded - 1}`;

            container.innerHTML += `
                <div class="week-card status-${status}">
                    <div class="week-label">${weekLabel} · Module ${index + 1}</div>
                    <div class="week-topic">${milestone.title}</div>
                    <div class="week-meta">${milestone.level} · ${milestone.skills.length} skills</div>
                    <div class="week-meta" style="margin-top: 4px;">⏱ ${pace}</div>
                    <span class="week-status-tag">${statusLabel}</span>
                </div>
            `;
            weekNum += weeksNeeded;
        });
    }

    // =============================================
    // MODULE TEST ENGINE
    // =============================================
    let activeTestState = { pathKey: null, milestoneIndex: null, questions: [], currentQ: 0, score: 0, selectedOpt: null };

    window.openModuleTest = (pathKey, milestoneIndex) => {
        const milestone = ROADMAP_DATA[pathKey].milestones[milestoneIndex];
        const questions = getQuizQuestions(pathKey, milestoneIndex);
        activeTestState = { pathKey, milestoneIndex, questions, currentQ: 0, score: 0, selectedOpt: null };

        document.getElementById('test-modal-title').textContent = milestone.title;
        document.getElementById('test-intro-desc').textContent =
            `Test your knowledge on "${milestone.title}" (${milestone.level} level). ${questions.length} questions, Adaptive scoring.`;
        document.getElementById('test-q-count').textContent = questions.length;

        // Show intro state
        document.getElementById('test-intro-state').style.display = 'block';
        document.getElementById('test-question-state').style.display = 'none';
        document.getElementById('test-result-state').style.display = 'none';
        document.getElementById('module-test-modal').style.display = 'flex';
        lucide.createIcons();
    };

    function renderCurrentQuestion() {
        const { questions, currentQ } = activeTestState;
        const q = questions[currentQ];
        const total = questions.length;

        document.getElementById('test-q-progress').textContent = `${currentQ + 1} / ${total}`;
        document.getElementById('test-q-fill').style.width = `${((currentQ + 1) / total) * 100}%`;
        document.getElementById('test-question-text').textContent = q.q;

        const optContainer = document.getElementById('test-options');
        optContainer.innerHTML = '';
        q.opts.forEach((opt, i) => {
            const btn = document.createElement('button');
            btn.className = 'test-option';
            btn.textContent = opt;
            btn.onclick = () => selectOption(i);
            optContainer.appendChild(btn);
        });

        const nextBtn = document.getElementById('next-q-btn');
        nextBtn.disabled = true;
        nextBtn.style.opacity = '0.4';
        nextBtn.textContent = currentQ < total - 1 ? 'Next Question' : 'See Results';
        activeTestState.selectedOpt = null;
    }

    function selectOption(selectedIndex) {
        const { questions, currentQ } = activeTestState;
        const correct = questions[currentQ].ans;

        document.querySelectorAll('.test-option').forEach((btn, i) => {
            btn.classList.remove('selected', 'correct', 'wrong');
            if (i === correct) btn.classList.add('correct');
            else if (i === selectedIndex && selectedIndex !== correct) btn.classList.add('wrong');
            btn.onclick = null; // Prevent re-selecting
        });

        if (selectedIndex === correct) activeTestState.score++;
        activeTestState.selectedOpt = selectedIndex;

        const nextBtn = document.getElementById('next-q-btn');
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
    }

    function showTestResults() {
        const { pathKey, milestoneIndex, questions, score } = activeTestState;
        const pct = Math.round((score / questions.length) * 100);

        // Save score to Firebase
        if (!userData.scores[pathKey]) userData.scores[pathKey] = {};
        userData.scores[pathKey][milestoneIndex] = pct;
        if (currentUser) {
            updateDoc(doc(db, 'users', currentUser.uid), {
                [`scores.${pathKey}`]: userData.scores[pathKey]
            }).catch(e => console.error("Error saving score:", e));
        }

        // Update result UI
        document.getElementById('result-score-text').textContent = `${pct}%`;
        const circle = document.getElementById('result-score-circle');
        circle.style.borderColor = pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';
        circle.style.background = pct >= 80 ? 'rgba(34,197,94,0.1)' : pct >= 60 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';

        let verdict, message, recommendation;
        if (pct >= 80) {
            verdict = '🏆 Excellent!';
            message = `You scored ${pct}% — Outstanding performance!`;
            recommendation = `<strong>AI Recommendation:</strong> You've mastered this module. Your schedule will be set to <strong>1 week</strong> for this stage. Move confidently to the next module. Focus next on: <strong>${ROADMAP_DATA[pathKey].milestones[milestoneIndex + 1]?.title || 'Final milestone reached!'}</strong>`;
        } else if (pct >= 60) {
            verdict = '📈 Good Progress!';
            message = `You scored ${pct}% — You're on the right track.`;
            recommendation = `<strong>AI Recommendation:</strong> You have good understanding but need refinement. Your schedule will allocate <strong>2 weeks</strong> for this module. Revisit: <strong>${questions.filter((_,i) => i < 2).map(q => q.q.slice(0,30)+'...').join(', ')}</strong>`;
        } else {
            verdict = '🔄 Keep Going!';
            message = `You scored ${pct}% — Extra practice will get you there.`;
            recommendation = `<strong>AI Recommendation:</strong> This module needs more focus. Your schedule will be extended to <strong>3 weeks</strong>. Re-study all skills in this module and practice with hands-on exercises before moving forward.`;
        }

        document.getElementById('result-verdict').textContent = verdict;
        document.getElementById('result-message').textContent = message;
        document.getElementById('ai-recommendation').innerHTML = recommendation;

        document.getElementById('test-question-state').style.display = 'none';
        document.getElementById('test-result-state').style.display = 'block';
    }

    function renderJobGuide(jobGuide) {
        const jobGuideContent = document.getElementById('job-guide-content');
        jobGuideContent.innerHTML = `
            <div class="guide-item"><strong>Resume Strategy</strong><p>${jobGuide.resume}</p></div>
            <div class="guide-item"><strong>Portfolio Building</strong><p>${jobGuide.portfolio}</p></div>
            <div class="guide-item"><strong>Interview Preparation</strong><p>${jobGuide.interview}</p></div>
        `;
    }

    // =============================================
    // TEST MODAL EVENT LISTENERS
    // =============================================
    function setupTestModalListeners() {
        document.getElementById('start-test-btn').addEventListener('click', () => {
            document.getElementById('test-intro-state').style.display = 'none';
            document.getElementById('test-question-state').style.display = 'block';
            renderCurrentQuestion();
        });

        document.getElementById('next-q-btn').addEventListener('click', () => {
            activeTestState.currentQ++;
            if (activeTestState.currentQ < activeTestState.questions.length) {
                renderCurrentQuestion();
            } else {
                showTestResults();
            }
        });

        document.getElementById('close-test-modal').addEventListener('click', () => {
            document.getElementById('module-test-modal').style.display = 'none';
        });

        document.getElementById('apply-schedule-btn').addEventListener('click', () => {
            document.getElementById('module-test-modal').style.display = 'none';
            // Refresh roadmap with new scores
            if (currentPath) showRoadmap(currentPath);
        });

        document.getElementById('module-test-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('module-test-modal')) {
                document.getElementById('module-test-modal').style.display = 'none';
            }
        });
    }


    // --- New Features Logic ---

    function renderQuizzes() {
        const quizzes = [
            { title: "Frontend Basics", questions: 15, duration: "10m", level: "Beginner" },
            { title: "Data Science Logic", questions: 20, duration: "15m", level: "Intermediate" },
            { title: "Cybersecurity Fundamentals", questions: 12, duration: "8m", level: "Beginner" },
            { title: "Product Strategy", questions: 10, duration: "5m", level: "Expert" }
        ];

        quizList.innerHTML = quizzes.map(q => `
            <div class="quiz-card fade-in">
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                    <span class="skill-badge badge-medium">${q.level}</span>
                    <span style="color: var(--text-secondary); font-size: 0.8rem;">${q.duration}</span>
                </div>
                <h3 style="margin-bottom: 10px;">${q.title}</h3>
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 20px;">${q.questions} Multiple Choice Questions</p>
                <button class="btn-primary" style="width: 100%;" onclick="alert('Quiz system starting soon!')">Start Assessment</button>
            </div>
        `).join('');
        lucide.createIcons();
    }

    function updateProfileStats() {
        // 1. Skills Mastered
        const completedCount = userData.completedSkills ? userData.completedSkills.length : 0;
        const skillsValEl = document.getElementById('stats-skills-val');
        if (skillsValEl) skillsValEl.textContent = completedCount;

        // 2. Aggregate Progress
        let totalProgressPct = 0;
        if (currentPath && userData.scores[currentPath]) {
            const scores = userData.scores[currentPath];
            const milestoneCount = ROADMAP_DATA[currentPath].milestones.length;
            const completedMilestones = Object.keys(scores).filter(k => scores[k] >= 80).length;
            totalProgressPct = Math.round((completedMilestones / milestoneCount) * 100);
        }
        
        const progressValEl = document.getElementById('stats-progress-val');
        if (progressValEl) progressValEl.textContent = `${totalProgressPct}%`;

        // 3. Certificates (Badges)
        const badgeCount = completedCount; // Simplified: 1 skill = 1 badge feel
        const badgesValEl = document.getElementById('stats-badges-val');
        if (badgesValEl) badgesValEl.textContent = badgeCount;

        // 4. Current Roadmap Card
        const titleCardEl = document.getElementById('roadmap-title-card');
        const levelTagEl = document.getElementById('roadmap-level-tag');
        const fillBarEl = document.getElementById('roadmap-progress-bar-fill');
        const statusTextEl = document.getElementById('roadmap-status-text');

        if (currentPath) {
            const pathData = ROADMAP_DATA[currentPath];
            if (titleCardEl) titleCardEl.textContent = pathData.title;
            
            // Calculate level (Basic simplified leveling)
            const level = totalProgressPct >= 80 ? 'Expert' : totalProgressPct >= 40 ? 'Intermediate' : 'Beginner';
            if (levelTagEl) levelTagEl.textContent = level;
            
            if (fillBarEl) fillBarEl.style.width = `${totalProgressPct}%`;
            if (statusTextEl) statusTextEl.textContent = totalProgressPct === 100 ? 'Course Mastered' : `${totalProgressPct}% Progress`;
        } else {
            if (titleCardEl) titleCardEl.textContent = 'Select a path to begin';
        }

        // 5. Skill Proficiency Bars
        renderSkillProficiency();

        // 6. Achievements Carousel
        renderAchievementsCarousel();
    }

    function renderSkillProficiency() {
        const container = document.getElementById('proficiency-skills-list');
        if (!container) return;

        if (!currentPath || !userData.scores[currentPath]) {
            container.innerHTML = `<p class="text-sm text-[#5d605c]">Explore career paths and take assessments to build your proficiency profile.</p>`;
            return;
        }

        const pathData = ROADMAP_DATA[currentPath];
        const scores = userData.scores[currentPath];
        
        container.innerHTML = pathData.milestones.map((milestone, idx) => {
            const score = scores[idx] || 0;
            const level = score >= 80 ? 'Expert' : score >= 60 ? 'Advanced' : score >= 40 ? 'Intermediate' : 'Novice';
            return `
                <div class="space-y-2">
                    <div class="flex justify-between text-sm">
                        <span class="font-medium text-[#303330]">${milestone.title}</span>
                        <span class="text-[#3b6852] font-bold">${level}</span>
                    </div>
                    <div class="h-1.5 w-full bg-[#e1e3de] rounded-full">
                        <div class="h-full bg-[#3b6852] rounded-full transition-all duration-1000" style="width: ${score}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderAchievementsCarousel() {
        const carousel = document.getElementById('achievements-carousel');
        if (!carousel) return;

        const skills = userData.completedSkills || [];
        if (skills.length === 0) {
            carousel.innerHTML = `
                <div class="flex-shrink-0 w-48 bg-white p-6 rounded-[2rem] text-center shadow-sm border border-[#e1e3de]">
                    <div class="w-20 h-20 bg-[#f4f4f0] rounded-full mx-auto mb-4 flex items-center justify-center">
                        <span class="material-symbols-outlined text-3xl text-gray-400">workspace_premium</span>
                    </div>
                    <h5 class="font-bold text-sm text-[#303330]">Locked</h5>
                    <p class="text-[10px] text-[#5d605c] uppercase tracking-widest mt-1">First Achievement</p>
                </div>
            `;
            return;
        }

        carousel.innerHTML = skills.map(skill => `
            <div class="flex-shrink-0 w-48 bg-white p-6 rounded-[2rem] text-center shadow-sm border border-[#e1e3de] hover:border-[#3b6852]/30 transition-all">
                <div class="w-20 h-20 bg-[#bceed2] rounded-full mx-auto mb-4 flex items-center justify-center">
                    <span class="material-symbols-outlined text-3xl text-[#3b6852]" style="font-variation-settings: 'FILL' 1;">workspace_premium</span>
                </div>
                <h5 class="font-bold text-sm text-[#303330]">${skill}</h5>
                <p class="text-[10px] text-[#5d605c] uppercase tracking-widest mt-1">Skill Mastered</p>
            </div>
        `).join('');
    }

    // --- Helpers ---

    function setupEventListeners() {
        backBtn.onclick = () => {
            switchView('path-selection');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
        
        closeModal.onclick = () => {
            skillModal.style.display = 'none';
        };
        
        window.onclick = (event) => {
            if (event.target === skillModal) {
                skillModal.style.display = 'none';
            }
        };

        const navBrand = document.getElementById('nav-brand');
        navBrand.onclick = () => {
            if (currentUser) {
                switchView('path-selection');
            } else {
                showHome();
            }
        };

        searchInput.addEventListener('input', (e) => {
            renderPathSelection(e.target.value);
        });

        getStartedBtn.addEventListener('click', () => {
            showLogin();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        // --- Auth Listeners ---
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = loginForm.querySelector('.btn-primary');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Processing...';
            lucide.createIcons();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                if (isRegistering) {
                    await createUserWithEmailAndPassword(auth, email, password);
                } else {
                    await signInWithEmailAndPassword(auth, email, password);
                }
            } catch (error) {
                alert(error.message);
            } finally {
                btn.innerHTML = originalText;
            }
        });

        googleLogin.addEventListener('click', async () => {
            googleLogin.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Connecting...';
            lucide.createIcons();
            try {
                await signInWithPopup(auth, googleProvider);
            } catch (error) {
                alert(error.message);
                googleLogin.innerHTML = 'Continue with Google';
                lucide.createIcons();
            }
        });

        signOutBtn.addEventListener('click', async () => {
            await signOut(auth);
        });

        // --- Sidebar Listeners ---
        sidebarSignOutBtn.addEventListener('click', async () => {
            await signOut(auth);
        });

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const view = item.getAttribute('data-view');
                switchView(view);
            });
        });

        const toggleRegister = document.getElementById('toggle-register');
        let isRegistering = false;
        toggleRegister.addEventListener('click', (e) => {
            e.preventDefault();
            isRegistering = !isRegistering;
            const header = loginView.querySelector('.login-header h2');
            const desc = loginView.querySelector('.login-header p');
            const submitBtn = loginView.querySelector('.btn-primary');
            
            if (isRegistering) {
                header.textContent = 'Create Account';
                desc.textContent = 'Join the career roadmap community';
                submitBtn.textContent = 'Sign Up';
                toggleRegister.textContent = 'Already have an account? Sign in';
            } else {
                header.textContent = 'Welcome Back';
                desc.textContent = 'Start your career journey with us';
                submitBtn.textContent = 'Sign In';
                toggleRegister.textContent = "Don't have an account? Create an account";
            }
        });
    }

    function setupProfileEditListeners() {
        // New Design Listeners
        const signOutBtnNew = document.getElementById('sign-out-btn-new');
        if (signOutBtnNew) signOutBtnNew.onclick = () => signOut(auth);

        const openEditBtnNew = document.getElementById('open-edit-profile-btn-new');
        if (openEditBtnNew) {
            openEditBtnNew.onclick = () => {
                document.getElementById('edit-profile-name').value = userData.profile.name || '';
                document.getElementById('edit-profile-goal').value = userData.profile.goal || '';
                document.getElementById('profile-edit-modal').style.display = 'flex';
            };
        }

        const avatarWrapperNew = document.getElementById('profile-avatar-wrapper-new');
        const photoInputNew = document.getElementById('direct-profile-photo-new');
        if (avatarWrapperNew && photoInputNew) {
            avatarWrapperNew.onclick = () => photoInputNew.click();
            photoInputNew.onchange = async (e) => {
                if (!currentUser || e.target.files.length === 0) return;
                const file = e.target.files[0];
                const avatarIcon = avatarWrapperNew.querySelector('.material-symbols-outlined');
                if (avatarIcon) avatarIcon.textContent = 'sync'; // Show loading state
                
                try {
                    const storageRef = ref(storage, `profile_photos/${currentUser.uid}_${file.name}`);
                    await uploadBytes(storageRef, file);
                    const photoURL = await getDownloadURL(storageRef);
                    userData.profile = { ...userData.profile, photoURL };
                    await updateDoc(doc(db, 'users', currentUser.uid), { profile: userData.profile });
                    updateProfileUI();
                } catch (err) {
                    console.error(err);
                    alert("Upload failed");
                }
            };
        }

        const closeProfileModal = document.getElementById('close-profile-modal');
        if (closeProfileModal) {
            closeProfileModal.onclick = () => {
                document.getElementById('profile-edit-modal').style.display = 'none';
            };
        }

        document.getElementById('profile-edit-form').onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('edit-profile-name').value;
            const goal = document.getElementById('edit-profile-goal').value;
            userData.profile = { ...userData.profile, name, goal };
            if (currentUser) {
                await updateDoc(doc(db, 'users', currentUser.uid), { profile: userData.profile });
            }
            updateProfileUI();
            document.getElementById('profile-edit-modal').style.display = 'none';
        };
    }

    function setupDiagnosticListeners() {
        document.getElementById('start-diag-btn').addEventListener('click', () => {
            document.getElementById('diag-intro-state').style.display = 'none';
            document.getElementById('diag-question-state').style.display = 'block';
            renderDiagQuestion();
        });

        document.getElementById('next-diag-btn').addEventListener('click', () => {
            activeDiagState.currentQ++;
            if (activeDiagState.currentQ < activeDiagState.questions.length) {
                renderDiagQuestion();
            } else {
                showDiagResults();
            }
        });

        document.getElementById('close-diag-modal').addEventListener('click', () => {
            document.getElementById('diagnostic-modal').style.display = 'none';
        });

        document.getElementById('generate-roadmap-btn').addEventListener('click', () => {
            document.getElementById('diagnostic-modal').style.display = 'none';
            if (activeDiagState.pathKey) showRoadmap(activeDiagState.pathKey);
        });

        document.getElementById('diagnostic-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('diagnostic-modal')) {
                document.getElementById('diagnostic-modal').style.display = 'none';
            }
        });
    }

    // =============================================
    // VIDEO PLAYER ENGINE
    // =============================================

    function initVideoPlayerListeners() {
        document.getElementById('player-back-btn').addEventListener('click', () => {
            if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
            clearInterval(antiSkipInterval);
            switchView('roadmap-container');
        });

        document.getElementById('start-video-quiz-btn').addEventListener('click', () => {
            const video = activePlaylist[currentVideoIndex];
            startVideoLessonQuiz(video.quiz);
        });
    }

    function openCoursePlayer(pathKey) {
        currentPath = pathKey;
        activePlaylist = PLAYLIST_DATA[pathKey] || [];
        if (activePlaylist.length === 0) return;

        document.getElementById('player-course-title').textContent = ROADMAP_DATA[pathKey].title;
        switchView('video-player-view');
        
        // Find first unwatched video
        const progress = userData.videoProgress[pathKey] || { lastPassedIndex: -1 };
        currentVideoIndex = Math.min(progress.lastPassedIndex + 1, activePlaylist.length - 1);
        
        renderPlaylist();
        loadVideo(currentVideoIndex);
    }

    function renderPlaylist() {
        const container = document.getElementById('playlist-items');
        const badge = document.getElementById('player-progress-badge');
        container.innerHTML = '';

        const progress = userData.videoProgress[currentPath] || { lastPassedIndex: -1 };
        const completedCount = progress.lastPassedIndex + 1;
        badge.textContent = `${completedCount}/${activePlaylist.length} Watched`;

        activePlaylist.forEach((video, index) => {
            const isCompleted = index <= progress.lastPassedIndex;
            const isCurrent = index === currentVideoIndex;
            const isLocked = index > progress.lastPassedIndex + 1;

            const item = document.createElement('div');
            item.className = `playlist-item ${isCompleted ? 'completed' : ''} ${isCurrent ? 'active' : ''} ${isLocked ? 'locked' : ''}`;
            
            item.innerHTML = `
                <div class="item-index">${isCompleted ? '✓' : index + 1}</div>
                <div class="item-info">
                    <div class="item-title">${video.title}</div>
                    <div class="item-status">${isLocked ? 'Locked' : isCompleted ? 'Completed' : 'Current Lesson'}</div>
                </div>
                ${isLocked ? '<i data-lucide="lock" style="width:16px; opacity:0.5;"></i>' : ''}
            `;

            if (!isLocked) {
                item.onclick = () => {
                    currentVideoIndex = index;
                    renderPlaylist();
                    loadVideo(index);
                };
            }
            container.appendChild(item);
        });
        lucide.createIcons();
    }

    function loadVideo(index) {
        const video = activePlaylist[index];
        document.getElementById('current-video-title').textContent = video.title;
        document.getElementById('video-quiz-overlay').style.display = 'none';
        
        maxTimeWatched = 0;
        clearInterval(antiSkipInterval);

        if (!ytPlayer) {
            ytPlayer = new YT.Player('youtube-player', {
                height: '100%',
                width: '100%',
                videoId: video.youtubeId,
                playerVars: { 
                    'autoplay': 1, 
                    'modestbranding': 1, 
                    'rel': 0,
                    'origin': window.location.origin
                },
                events: {
                    'onStateChange': onPlayerStateChange,
                    'onReady': (e) => startAntiSkipMonitor(),
                    'onError': (e) => {
                        console.error("YouTube Player Error:", e.data);
                        alert("This video might be unavailable for embedding. We recommend searching the title on YouTube directly or trying the next lesson.");
                    }
                }
            });
        } else {
            ytPlayer.loadVideoById({
                videoId: video.youtubeId,
                origin: window.location.origin
            });
            startAntiSkipMonitor();
        }
    }

    function onPlayerStateChange(event) {
        if (event.data === YT.PlayerState.ENDED) {
            document.getElementById('video-quiz-overlay').style.display = 'flex';
            clearInterval(antiSkipInterval);
        }
    }

    function startAntiSkipMonitor() {
        antiSkipInterval = setInterval(() => {
            if (ytPlayer && ytPlayer.getCurrentTime) {
                const currentTime = ytPlayer.getCurrentTime();
                if (currentTime > maxTimeWatched + 2) {
                    ytPlayer.seekTo(maxTimeWatched);
                } else {
                    maxTimeWatched = Math.max(maxTimeWatched, currentTime);
                }
            }
        }, 1000);
    }

    // =============================================
    // VIDEO QUIZ & RESTRICTIONS
    // =============================================

    function setupAntiCopyRestrictions() {
        const blockAction = (e) => {
            if (isQuizActive) {
                e.preventDefault();
                showAntiCopyWarning();
            }
        };

        document.addEventListener('copy', blockAction);
        document.addEventListener('paste', blockAction);
        document.addEventListener('contextmenu', blockAction);
        document.addEventListener('keydown', (e) => {
            if (isQuizActive && (e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v')) {
                e.preventDefault();
                showAntiCopyWarning();
            }
        });
    }

    function showAntiCopyWarning() {
        let badge = document.querySelector('.anti-copy-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'anti-copy-badge';
            badge.textContent = '🔒 Copy/Paste Restricted During Test';
            document.body.appendChild(badge);
        }
        badge.style.display = 'block';
        setTimeout(() => badge.style.display = 'none', 3000);
    }

    function startVideoLessonQuiz(video) {
        isQuizActive = true;
        
        activeTestState = { 
            pathKey: currentPath, 
            milestoneIndex: currentVideoIndex, 
            questions: video.quiz || [], 
            currentQ: 0, 
            score: 0, 
            selectedOpt: null,
            isLessonQuiz: true,
            testType: video.testType || 'quiz',
            task: video.task || ''
        };

        document.getElementById('test-modal-title').textContent = `Lesson Assessment: ${video.title}`;
        document.getElementById('test-intro-desc').textContent = "Complete this challenge to unlock the next lesson.";
        
        // Render appropriate view based on test type
        renderTestView();

        document.getElementById('test-intro-state').style.display = 'block';
        document.getElementById('test-question-state').style.display = 'none';
        document.getElementById('test-coding-state').style.display = 'none';
        document.getElementById('test-html-state').style.display = 'none';
        document.getElementById('test-data-state').style.display = 'none';
        document.getElementById('test-result-state').style.display = 'none';
        document.getElementById('module-test-modal').style.display = 'flex';
        
        document.getElementById('video-quiz-overlay').style.display = 'none';
        lucide.createIcons();
    }

    function renderTestView() {
        // Reset sub-views
        const states = ['test-question-state', 'test-coding-state', 'test-html-state', 'test-data-state'];
        states.forEach(s => document.getElementById(s).style.display = 'none');

        const { testType, task, questions } = activeTestState;

        if (testType === 'quiz') {
            document.getElementById('test-q-count').textContent = questions.length;
        } else if (testType === 'coding-challenge') {
            document.getElementById('coding-task-desc').textContent = task;
            document.getElementById('coding-textarea').value = '';
        } else if (testType === 'html-lab') {
            document.getElementById('html-task-desc').textContent = task;
            document.getElementById('html-lab-textarea').value = '<!-- Write HTML here -->\n<div class="card">\n  \n</div>';
            updateHtmlPreview();
        } else if (testType === 'data-lab') {
            document.getElementById('data-task-desc').textContent = task;
            document.getElementById('data-task-display').innerHTML = '<p>Dataset: [Sample Data View]</p><table style="width:100%; border-collapse:collapse; font-size:12px;"><tr><th>ID</th><th>Value</th></tr><tr><td>1</td><td>100</td></tr><tr><td>2</td><td>200</td></tr></table>';
        }
    }

    // Initialize listeners for specialized tests
    document.getElementById('start-test-btn').onclick = () => {
        document.getElementById('test-intro-state').style.display = 'none';
        const type = activeTestState.testType;
        if (type === 'quiz') {
            document.getElementById('test-question-state').style.display = 'block';
            renderTestQuestion();
        } else if (type === 'coding-challenge') {
            document.getElementById('test-coding-state').style.display = 'block';
        } else if (type === 'html-lab') {
            document.getElementById('test-html-state').style.display = 'block';
        } else if (type === 'data-lab') {
            document.getElementById('test-data-state').style.display = 'block';
        }
    };

    // HTML Lab Preview Engine
    const htmlTextArea = document.getElementById('html-lab-textarea');
    htmlTextArea.addEventListener('input', updateHtmlPreview);

    function updateHtmlPreview() {
        const previewFrame = document.getElementById('html-lab-preview');
        const content = htmlTextArea.value;
        const frameDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
        frameDoc.open();
        frameDoc.write(`
            <style>
                body { font-family: sans-serif; padding: 20px; }
                .card { padding: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #ddd; }
            </style>
            ${content}
        `);
        frameDoc.close();
    }

    // Submission Handlers
    document.getElementById('submit-code-btn').onclick = () => validateSpecialTest('coding');
    document.getElementById('submit-html-btn').onclick = () => validateSpecialTest('html');
    document.getElementById('submit-data-btn').onclick = () => validateSpecialTest('data');

    async function validateSpecialTest(type) {
        let passed = false;
        if (type === 'coding') {
            const code = document.getElementById('coding-textarea').value;
            // Simple validation: check if code is not empty and has basic structure
            if (code.length > 20) passed = true;
        } else if (type === 'html') {
            const html = document.getElementById('html-lab-textarea').value;
            if (html.includes('<div') || html.includes('<p')) passed = true;
        } else if (type === 'data') {
            const input = document.getElementById('data-lab-input').value;
            if (input.length > 5) passed = true;
        }

        if (passed) {
            activeTestState.score = activeTestState.questions.length || 1; // Simulation pass
            showTestResults();
        } else {
            alert("Your solution is incomplete or incorrect. Please try again!");
        }
    }

    // Override the "Apply Schedule" button logic to handle lesson completion
    const originalApplyBtn = document.getElementById('apply-schedule-btn');
    const newApplyBtn = originalApplyBtn.cloneNode(true);
    originalApplyBtn.parentNode.replaceChild(newApplyBtn, originalApplyBtn);

    newApplyBtn.addEventListener('click', async () => {
        if (activeTestState.isLessonQuiz) {
            const pct = Math.round((activeTestState.score / activeTestState.questions.length) * 100);
            
            if (pct >= 80) {
                // Unlock logic
                const progress = userData.videoProgress[currentPath] || { lastPassedIndex: -1 };
                if (currentVideoIndex > progress.lastPassedIndex) {
                    progress.lastPassedIndex = currentVideoIndex;
                    userData.videoProgress[currentPath] = progress;
                    
                    if (currentUser) {
                        await updateDoc(doc(db, 'users', currentUser.uid), {
                            videoProgress: userData.videoProgress
                        });
                    }
                }
                
                document.getElementById('module-test-modal').style.display = 'none';
                isQuizActive = false;
                renderPlaylist(); // Update locked/completed icons
                
                // Move to next video if available
                if (currentVideoIndex < activePlaylist.length - 1) {
                    currentVideoIndex++;
                    renderPlaylist();
                    loadVideo(currentVideoIndex);
                } else {
                    alert("Congratulations! You've completed all videos in this course!");
                    switchView('roadmap-container');
                }
            } else {
                document.getElementById('module-test-modal').style.display = 'none';
                isQuizActive = false;
                alert("You need at least 80% to pass. Please re-watch the video and try again!");
            }
        } else {
            // Original Roadmap Logic
            document.getElementById('module-test-modal').style.display = 'none';
            if (currentPath) showRoadmap(currentPath);
        }
    });

    // Export for empty state visibility
    window.app.showHome = () => switchView('path-selection');

    // Start
    init();
});

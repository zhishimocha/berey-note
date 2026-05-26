const STORAGE_KEY = 'berry-start-todo-v1'

const todayKey = () => toDateKey(new Date())
const toDateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const addDays = (key, days) => {
  const date = new Date(`${key}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

const shortDate = (key) => {
  const [, month, day] = key.split('-')
  return `${Number(month)}/${Number(day)}`
}

const selectedDateParts = () => {
  const [year, month, day] = state.selectedDate.split('-').map(Number)
  return { year, month, day }
}

const monthLabel = (month) => `${month}月`

const setSelectedMonth = (month) => {
  const { year, day } = selectedDateParts()
  const next = new Date(year, month - 1, 1)
  const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  state.selectedDate = toDateKey(new Date(next.getFullYear(), next.getMonth(), Math.min(day, maxDay)))
  calendarCursor = new Date(`${state.selectedDate}T00:00:00`)
  saveState()
}

const setSelectedYear = (year) => {
  const { month, day } = selectedDateParts()
  const maxDay = new Date(year, month, 0).getDate()
  state.selectedDate = toDateKey(new Date(year, month - 1, Math.min(day, maxDay)))
  calendarCursor = new Date(`${state.selectedDate}T00:00:00`)
  saveState()
}

const quadrantNames = {
  q1: '紧急重要',
  q2: '重要不紧急',
  q3: '紧急不重要',
  q4: '不紧急不重要',
}

const MAJOR_EVENT = 'major'
const MAJOR_EVENT_MAX_POINTS = 100
const defaultScoreRules = {
  q1: 8,
  q2: 6,
  q3: 4,
  q4: 2,
}
const GACHA_TASK_TARGET = 5
const gachaRewards = [
  { points: 5, weight: 35 },
  { points: 6, weight: 30 },
  { points: 8, weight: 20 },
  { points: 11, weight: 10 },
  { points: 18, weight: 5 },
]

const taskCategoryName = (task) => task?.quadrant === MAJOR_EVENT ? '重大事件' : quadrantNames[task?.quadrant]

function scoreRules() {
  return { ...defaultScoreRules, ...(state.scoreRules || {}) }
}

function clampPoints(value, fallback = 5) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(MAJOR_EVENT_MAX_POINTS, Math.max(1, Math.round(number)))
}

function taskScore(task) {
  if (task?.quadrant === MAJOR_EVENT) return clampPoints(task.points, 30)
  return clampPoints(scoreRules()[task?.quadrant], 5)
}

const timerModes = [
  { id: 'countup', label: '正计' },
  { id: 'countdown', label: '倒计' },
  { id: 'pomodoro', label: '番茄' },
  { id: 'startup', label: '启动' },
]

const defaultState = () => ({
  selectedDate: todayKey(),
  lastSeenDate: todayKey(),
  rolloverReviewedDate: '',
  activeView: 'quadrants',
  points: 15,
  avatarImage: '',
  completedTotal: 2,
  completions: {},
  tomorrowFirst: {},
  scoreRules: defaultScoreRules,
  gachaSpinsUsed: 0,
  lastGachaReward: null,
  lastAction: null,
  tasks: [
    {
      id: crypto.randomUUID(),
      title: '把 Todo 第一版跑起来',
      date: todayKey(),
      quadrant: 'q1',
      done: false,
      createdAt: Date.now() - 300000,
    },
    {
      id: crypto.randomUUID(),
      title: '整理明天最先做的一件事',
      date: todayKey(),
      quadrant: 'q2',
      done: false,
      createdAt: Date.now() - 240000,
    },
    {
      id: crypto.randomUUID(),
      title: '给自己换一个小奖励',
      date: todayKey(),
      quadrant: 'q4',
      done: false,
      createdAt: Date.now() - 120000,
    },
  ],
  habits: [
    { id: crypto.randomUUID(), name: '喝水', streak: 3, startDate: todayKey(), endDate: addDays(todayKey(), 20), permanent: false, checkedDates: [] },
    { id: crypto.randomUUID(), name: '睡前收尾', streak: 1, startDate: todayKey(), permanent: true, checkedDates: [] },
  ],
  rewards: [
    { id: crypto.randomUUID(), name: '休息半小时', cost: 20 },
    { id: crypto.randomUUID(), name: '奶茶券', cost: 30 },
    { id: crypto.randomUUID(), name: '买小东西', cost: 80 },
  ],
})

let state = loadState()
let screen = 'card'
let cardIndex = 0
let activeTimerTaskId = null
let timerMode = 'startup'
let timerRunning = false
let timerSeconds = 0
let timerTarget = 300
let countdownSelection = { hours: 0, minutes: 10, seconds: 0 }
let timerInterval = null
let startupPromptShown = false
let calendarCursor = new Date(`${state.selectedDate}T00:00:00`)
let pressTimer = null
let touchStart = null
let profileOpen = false
let calendarYearOpen = false
let taskDatePicker = null
let lastSwipeAt = 0
let isDeleteMode = false
let rolloverPromptOpen = false
let gachaAnimation = 'idle'
let concealedGachaPoints = 0

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (!stored) return defaultState()
    const defaults = defaultState()
    const loaded = {
      ...defaults,
      ...stored,
      scoreRules: { ...defaults.scoreRules, ...(stored.scoreRules || {}) },
      tasks: (stored.tasks || defaults.tasks).map(normalizeTask),
    }
    if (loaded.lastSeenDate !== todayKey()) {
      loaded.selectedDate = todayKey()
      loaded.lastSeenDate = todayKey()
    }
    return loaded
  } catch {
    return defaultState()
  }
}

function saveState() {
  state.lastSeenDate = todayKey()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function normalizeTask(task) {
  if (task.endDate && task.endDate > task.date && task.done && !task.completedDates?.length) {
    return { ...task, done: false, completedDates: [task.date] }
  }
  return { ...task, completedDates: task.completedDates || [] }
}

function isRangeTask(task) {
  return Boolean(task.endDate && task.endDate > task.date)
}

function taskAppliesOnDate(task, date) {
  if (isRangeTask(task)) return task.date <= date && date <= task.endDate
  return task.date === date
}

function taskCompletedOnDate(task, date) {
  if (isRangeTask(task)) return task.completedDates?.includes(date)
  return task.done
}

function visibleTasks(date = state.selectedDate) {
  return state.tasks
    .filter((task) => taskAppliesOnDate(task, date) && !taskCompletedOnDate(task, date))
    .sort((a, b) => a.createdAt - b.createdAt)
}

function listedTasks(date = state.selectedDate) {
  return state.tasks
    .filter((task) => taskAppliesOnDate(task, date) && !taskCompletedOnDate(task, date))
    .sort((a, b) => a.createdAt - b.createdAt)
}

function cardQueue() {
  const today = todayKey()
  const tasks = visibleTasks(today)
  const firstId = state.tomorrowFirst[today]
  const manual = tasks.find((task) => task.id === firstId)
  const urgentImportant = tasks.filter((task) => task.quadrant === 'q1')
  const ordered = manual
    ? [manual, ...tasks.filter((task) => task.id !== manual.id)]
    : [...urgentImportant, ...tasks.filter((task) => task.quadrant !== 'q1')]

  return ordered
}

function currentCardTask() {
  const queue = cardQueue()
  return queue[cardIndex % Math.max(queue.length, 1)]
}

function completeTask(taskId, completionDate = todayKey()) {
  const task = state.tasks.find((item) => item.id === taskId)
  if (!task || !taskAppliesOnDate(task, completionDate) || taskCompletedOnDate(task, completionDate)) return
  const earnedPoints = taskScore(task)
  if (isRangeTask(task)) task.completedDates = [...(task.completedDates || []), completionDate]
  else task.done = true
  state.points += earnedPoints
  state.completedTotal += 1
  state.completions[todayKey()] = (state.completions[todayKey()] || 0) + 1
  Object.keys(state.tomorrowFirst).forEach((key) => {
    if (state.tomorrowFirst[key] === taskId) delete state.tomorrowFirst[key]
  })
  saveState()
  cardIndex = 0
  render()
}

function setTomorrowFirst(taskId) {
  const targetDate = addDays(state.selectedDate, 1)
  const previousTaskId = state.tomorrowFirst[targetDate] || null
  state.tomorrowFirst[targetDate] = taskId
  state.lastAction = { type: 'tomorrowFirst', date: targetDate, previousTaskId }
  saveState()
  render()
  toast('已经放到明日首要')
}

function addTask(form) {
  const data = new FormData(form)
  const title = data.get('title').trim()
  const note = data.get('note')?.trim() || ''
  if (!title) return
  const category = data.get('quadrant')
  const customPoints = category === MAJOR_EVENT ? clampPoints(data.get('customPoints'), 30) : null
  const startDate = data.get('date')
  const endDate = data.get('endDate') || startDate
  const normalizedEndDate = endDate >= startDate ? endDate : startDate
  const task = {
    id: crypto.randomUUID(),
    title,
    note,
    date: startDate,
    endDate: normalizedEndDate,
    quadrant: category,
    points: customPoints,
    done: false,
    completedDates: [],
    createdAt: Date.now(),
  }

  state.tasks.push(task)
  state.lastAction = { type: 'addTask', taskIds: [task.id] }
  saveState()
  closeModal()
  render()
}

function undoLastAction() {
  const action = state.lastAction
  if (!action) return

  if (action.type === 'addTask') {
    const ids = action.taskIds || [action.taskId]
    state.tasks = state.tasks.filter((task) => !ids.includes(task.id))
  }

  if (action.type === 'tomorrowFirst') {
    if (action.previousTaskId) state.tomorrowFirst[action.date] = action.previousTaskId
    else delete state.tomorrowFirst[action.date]
  }

  state.lastAction = null
  saveState()
  render()
  toast('已撤回')
}

function addHabit(form) {
  const data = new FormData(form)
  const name = data.get('name').trim()
  const startDate = data.get('startDate') || todayKey()
  const permanent = data.get('permanent') === 'on'
  const endDate = permanent ? null : data.get('endDate') || startDate
  if (!name) return
  const targetDays = permanent
    ? null
    : Math.max(1, Math.round((new Date(`${endDate}T00:00:00`) - new Date(`${startDate}T00:00:00`)) / 86400000) + 1)
  state.habits.push({ id: crypto.randomUUID(), name, streak: 0, startDate, endDate, permanent, targetDays, checkedDates: [] })
  saveState()
  closeModal()
  render()
}

function addReward(form) {
  const data = new FormData(form)
  const name = data.get('name').trim()
  const cost = Number(data.get('cost'))
  if (!name || !cost) return
  state.rewards.push({ id: crypto.randomUUID(), name, cost })
  saveState()
  closeModal()
  render()
}

function updateScoreRule(id, value) {
  if (!quadrantNames[id]) return
  state.scoreRules = {
    ...scoreRules(),
    [id]: Math.min(30, Math.max(1, Math.round(Number(value) || defaultScoreRules[id]))),
  }
  saveState()
  render()
}

function checkHabit(id) {
  const habit = state.habits.find((item) => item.id === id)
  if (!habit || !isHabitVisible(habit) || habit.checkedDates.includes(todayKey())) return
  habit.checkedDates.push(todayKey())
  habit.streak += 1
  state.points += 5
  saveState()
  render()
}

function redeemReward(id) {
  const reward = state.rewards.find((item) => item.id === id)
  if (!reward || state.points < reward.cost) return toast('积分还不够')
  state.points -= reward.cost
  saveState()
  render()
}

function gachaProgress() {
  const completed = state.completedTotal || 0
  const earnedSpins = Math.floor(completed / GACHA_TASK_TARGET)
  const usedSpins = Math.min(earnedSpins, state.gachaSpinsUsed || 0)
  return {
    completed,
    towardNext: completed % GACHA_TASK_TARGET,
    remaining: GACHA_TASK_TARGET - (completed % GACHA_TASK_TARGET),
    available: earnedSpins - usedSpins,
  }
}

function drawGachaReward() {
  const value = Math.random() * 100
  let cursor = 0
  return gachaRewards.find((reward) => {
    cursor += reward.weight
    return value < cursor
  }) || gachaRewards[gachaRewards.length - 1]
}

function spinGacha() {
  const progress = gachaProgress()
  if (!progress.available || gachaAnimation === 'spinning') return toast('再完成一些任务就能扭蛋啦')
  const reward = drawGachaReward()
  state.gachaSpinsUsed = (state.gachaSpinsUsed || 0) + 1
  state.points += reward.points
  state.lastGachaReward = { points: reward.points, date: todayKey(), claimedAt: Date.now() }
  saveState()
  concealedGachaPoints = reward.points
  gachaAnimation = 'spinning'
  render()
  setTimeout(() => {
    concealedGachaPoints = 0
    gachaAnimation = 'revealed'
    render()
  }, 1250)
}

function deleteTask(taskId) {
  state.tasks = state.tasks.filter((task) => task.id !== taskId)
  Object.keys(state.tomorrowFirst).forEach((key) => {
    if (state.tomorrowFirst[key] === taskId) delete state.tomorrowFirst[key]
  })
  saveState()
  render()
}

function pendingRolloverTasks() {
  return state.tasks
    .filter((task) => rolloverDeadline(task) < todayKey() && !taskCompletedOnDate(task, rolloverDeadline(task)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
}

function rolloverDeadline(task) {
  return task.endDate || task.date
}

function openRolloverPrompt() {
  const tasks = pendingRolloverTasks()
  if (!tasks.length) {
    markRolloverReviewed()
    return
  }
  rolloverPromptOpen = true
  openModal(`
    <div class="modal-form rollover-panel">
      <h2>未完成任务要顺延吗？</h2>
      <p>昨天之前留下了 ${tasks.length} 件事。选一个新日期继续，或删掉不再安排的任务。</p>
      <div class="rollover-list">
        ${tasks.map((task) => {
          const deadline = rolloverDeadline(task)
          const deadlineCopy = deadline >= todayKey() ? `有效期至 ${shortDate(deadline)}` : `已于 ${shortDate(deadline)} 过期`
          return `
            <article class="rollover-task">
              <strong>${escapeHtml(task.title)}</strong>
              <small>原定 ${shortDate(task.date)} · ${deadlineCopy}</small>
              <label>顺延到
                <input type="date" min="${todayKey()}" value="${todayKey()}" data-rollover-date="${task.id}" />
              </label>
              <div class="rollover-actions">
                <button type="button" data-rollover-move="${task.id}">顺延</button>
                <button type="button" class="ghost-danger" data-rollover-delete="${task.id}">删除</button>
              </div>
            </article>
          `
        }).join('')}
      </div>
      <button type="button" class="rollover-later" data-action="rollover-dismiss">暂不处理，明天再问</button>
    </div>
  `)
}

function maybeOpenRolloverPrompt() {
  if (state.rolloverReviewedDate === todayKey() || !pendingRolloverTasks().length) return
  openRolloverPrompt()
}

function markRolloverReviewed() {
  rolloverPromptOpen = false
  state.rolloverReviewedDate = todayKey()
  saveState()
  closeModal()
}

function moveRolloverTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId)
  const targetDate = document.querySelector(`[data-rollover-date="${taskId}"]`)?.value
  if (!task || !targetDate || targetDate < todayKey()) return toast('请选择今天或之后的日期')
  task.date = targetDate
  if (!task.endDate || targetDate > task.endDate) task.endDate = targetDate
  saveState()
  refreshRolloverPrompt('任务已顺延')
}

function discardRolloverTask(taskId) {
  state.tasks = state.tasks.filter((task) => task.id !== taskId)
  Object.keys(state.tomorrowFirst).forEach((key) => {
    if (state.tomorrowFirst[key] === taskId) delete state.tomorrowFirst[key]
  })
  saveState()
  refreshRolloverPrompt('任务已删除')
}

function refreshRolloverPrompt(message) {
  render()
  if (pendingRolloverTasks().length) openRolloverPrompt()
  else markRolloverReviewed()
  toast(message)
}

function deleteHabit(id) {
  state.habits = state.habits.filter((habit) => habit.id !== id)
  saveState()
  render()
}

function deleteReward(id) {
  state.rewards = state.rewards.filter((reward) => reward.id !== id)
  saveState()
  render()
}

function render() {
  const app = document.querySelector('#app')
  app.innerHTML = screen === 'card' ? renderCardScreen() : screen === 'timer' ? renderTimerScreen() : renderMainScreen()
  bindEvents()
}

function renderCardScreen() {
  const task = currentCardTask()
  return `
    <main class="shell card-shell">
      <div class="gingham-strip"></div>
      <section class="card-stage" aria-label="今日任务卡片">
        <button class="round-entry" data-action="main" aria-label="进入主界面">□</button>
        <article class="task-focus-card" data-swipe-card>
          <span class="sticker-label">today first</span>
          <div class="bow-mark"></div>
          ${task ? `<h1>${escapeHtml(task.title)}</h1><p>${taskCategoryName(task)} · +${taskScore(task)}分</p>${task.note ? `<p class="task-note">${escapeHtml(task.note)}</p>` : ''}` : `<h1>今天没有待办</h1><p>可以轻轻休息一下</p>`}
          <div class="card-actions">
            <button type="button" data-action="timer" ${task ? '' : 'disabled'}>进入计时</button>
            <button type="button" data-action="next-card" ${task ? '' : 'disabled'}>下一张</button>
            <button type="button" data-action="complete-card" ${task ? '' : 'disabled'}>完成</button>
          </div>
        </article>
      </section>
    </main>
  `
}

function renderTimerScreen() {
  const task = state.tasks.find((item) => item.id === activeTimerTaskId) || currentCardTask()
  const display = formatTimer(timerSeconds, timerMode)
  const showCountdownPicker = timerMode === 'countdown' && !timerRunning
  return `
    <main class="shell timer-shell">
      <header class="topbar">
        <strong>${state.points}分</strong>
        <div class="timer-title-card">
          <h1>${task ? escapeHtml(task.title) : '今天没有待办'}</h1>
        </div>
        <button class="soft-icon" data-action="card" aria-label="返回卡片">‹</button>
      </header>
      <nav class="mode-tabs">
        ${timerModes.map((mode) => `<button class="${mode.id === timerMode ? 'active' : ''}" data-timer-mode="${mode.id}">${mode.label}</button>`).join('')}
      </nav>
      <section class="timer-center ${timerMode}">
        <div class="timer-orb ${showCountdownPicker ? 'has-picker' : ''}">
          ${showCountdownPicker
            ? `${renderCountdownPicker()}<button class="countdown-start" data-action="toggle-timer">开始倒计时</button>`
            : `<button class="timer-orb-button" data-action="toggle-timer"><span class="timer-display">${timerRunning ? display : timerMode === 'startup' ? '要不要来 5 分钟试试？' : display}</span></button>`}
        </div>
        <p>${timerHint()}</p>
      </section>
      <div class="timer-actions">
        <button data-action="pause-timer">暂停</button>
        <button data-action="finish-timer" ${task ? '' : 'disabled'}>完成</button>
        <button data-action="rest-timer">休息</button>
      </div>
    </main>
  `
}

function renderCountdownPicker() {
  const units = [
    ['hours', '时', 23],
    ['minutes', '分', 59],
    ['seconds', '秒', 59],
  ]
  return `
    <div class="countdown-picker" aria-label="倒计时时间">
      ${units.map(([unit, label, max]) => `
        <label>
          <div class="countdown-wheel" data-countdown-wheel="${unit}" data-max="${max}" role="listbox" aria-label="${label}">
            <i aria-hidden="true"></i>
            ${Array.from({ length: max + 1 }, (_, value) => `<button type="button" role="option" class="${countdownSelection[unit] === value ? 'picked' : ''}" data-countdown-value="${value}" aria-selected="${countdownSelection[unit] === value}">${String(value).padStart(2, '0')}</button>`).join('')}
            <i aria-hidden="true"></i>
          </div>
          <span>${label}</span>
        </label>
      `).join('')}
    </div>
  `
}

function renderMainScreen() {
  const displayedPoints = state.points - (gachaAnimation === 'spinning' ? concealedGachaPoints : 0)
  return `
    <main class="shell app-shell">
      <header class="main-header">
        ${state.activeView === 'quadrants'
          ? `<span class="date-pill">${shortDate(todayKey())}</span>`
          : '<div class="header-spacer"></div>'}
        <div class="points-center">
          <span>积分</span>
          <strong>${displayedPoints}</strong>
        </div>
        <button class="avatar-button" data-action="profile" aria-label="头像菜单">
          ${state.avatarImage ? `<img src="${escapeHtml(state.avatarImage)}" alt="" />` : ''}
        </button>
      </header>
      ${profileOpen ? renderProfileMenu() : ''}
      ${renderActiveView()}
      <nav class="bottom-nav">
        ${[
          ['quadrants', '四象限'],
          ['habits', '习惯'],
          ['shop', '小卖部'],
          ['achievements', '成就'],
        ].map(([id, label]) => `<button class="${state.activeView === id ? 'active' : ''}" data-view="${id}">${label}</button>`).join('')}
      </nav>
      ${state.activeView === 'achievements' ? '' : `<button class="fab fab-card" data-action="card" aria-label="卡片模式">卡</button>`}
      ${state.activeView === 'achievements' ? '' : `<button class="fab fab-add" data-action="add" aria-label="添加">＋</button>`}
    </main>
  `
}

function renderProfileMenu() {
  return `
    <section class="profile-menu">
      <button data-action="open-profile-modal">个人资料</button>
      <button data-action="open-sync-modal">同步设置</button>
    </section>
  `
}

function openProfileModal() {
  const rules = scoreRules()
  profileOpen = false
  document.querySelector('.profile-menu')?.remove()
  openModal(`
    <div class="modal-form profile-panel">
      <h2>个人资料</h2>
      <label class="avatar-picker">
        <span>头像</span>
        <input type="file" accept="image/*" data-avatar-upload />
        <i>${state.avatarImage ? `<img src="${escapeHtml(state.avatarImage)}" alt="" />` : ''}</i>
      </label>
      <div class="profile-score-settings">
        <strong>基础分</strong>
        <div class="score-rules">
          ${Object.entries(quadrantNames).map(([id, name]) => `
            <label>
              <span>${name}</span>
              <input type="number" min="1" max="30" value="${rules[id]}" data-score-rule="${id}" />
            </label>
          `).join('')}
        </div>
      </div>
    </div>
  `)
}

function openSyncModal() {
  profileOpen = false
  document.querySelector('.profile-menu')?.remove()
  openModal(`
    <div class="modal-form sync-panel">
      <h2>同步设置</h2>
      <button type="button" data-export-state>导出</button>
      <label class="import-button">
        导入
        <input type="file" accept="application/json,.json" data-import-state />
      </label>
    </div>
  `)
}

function renderActiveView() {
  if (state.activeView === 'habits') return renderHabits()
  if (state.activeView === 'shop') return renderShop()
  if (state.activeView === 'achievements') return renderAchievements()
  return renderQuadrants()
}

function renderQuadrants() {
  const tomorrowId = state.tomorrowFirst[addDays(state.selectedDate, 1)]
  const tomorrowTask = state.tasks.find((task) => task.id === tomorrowId)
  const tasks = listedTasks()
  const majorTasks = tasks.filter((task) => task.quadrant === MAJOR_EVENT)
  return `
    <section class="content-stack">
      <div class="quadrant-tools">
        <div class="tomorrow-slot">
          <span>明日首要</span>
          <strong>${tomorrowTask ? escapeHtml(tomorrowTask.title) : '长按任务设为明天第一张'}</strong>
        </div>
        <button class="delete-mode-button ${isDeleteMode ? 'active' : ''}" data-action="toggle-delete">删除</button>
      </div>
      <section class="major-events">
        <h2>重大事件</h2>
        <div class="task-list">
          ${majorTasks.map(renderSmallTask).join('')}
        </div>
      </section>
      <div class="quadrant-grid">
        ${Object.entries(quadrantNames).map(([id, name]) => `
          <section class="quadrant">
            <h2>${name}</h2>
            <div class="task-list">
              ${tasks.filter((task) => task.quadrant === id).map(renderSmallTask).join('')}
            </div>
          </section>
        `).join('')}
      </div>
    </section>
  `
}

function renderSmallTask(task) {
  const deadline = task.endDate && task.endDate !== task.date ? ` · 截止 ${shortDate(task.endDate)}` : ''
  return `
    <article class="mini-task ${isDeleteMode ? 'is-deleting' : ''}">
      <button class="mini-task-copy" data-task-id="${task.id}">
        <span>${escapeHtml(task.title)}</span>
        ${task.note ? `<em>${escapeHtml(task.note)}</em>` : ''}
        <small>${taskCategoryName(task)} · +${taskScore(task)}分${deadline}</small>
      </button>
      ${isDeleteMode ? '' : `<button class="check-round task-check" data-complete-task="${task.id}" aria-label="标记完成"></button>`}
      ${isDeleteMode ? `<i class="delete-dot" data-delete-task="${task.id}">×</i>` : ''}
    </article>
  `
}

function renderHabits() {
  const habits = state.habits.filter(isHabitVisible)
  return `
    <section class="compact-list">
      ${habits.map((habit) => `
        <article class="habit-row">
          <button class="delete-dot item-delete" data-delete-habit="${habit.id}" aria-label="删除习惯">×</button>
          <div>
            <strong>${escapeHtml(habit.name)}</strong>
            <span>${habitMeta(habit)}</span>
          </div>
          <button class="check-round ${habit.checkedDates.includes(todayKey()) ? 'done' : ''}" data-habit-id="${habit.id}" aria-label="${habit.checkedDates.includes(todayKey()) ? '今日已打卡' : '今日打卡'}"></button>
        </article>
      `).join('')}
    </section>
  `
}

function isHabitVisible(habit) {
  if (!habit.startDate && !habit.endDate && !habit.permanent) return true
  const today = todayKey()
  const startDate = habit.startDate || today
  if (today < startDate) return false
  if (habit.permanent) return true
  return today <= (habit.endDate || addDays(startDate, (habit.targetDays || 21) - 1))
}

function habitMeta(habit) {
  return `连续 ${habit.streak} 天`
}

function renderShop() {
  return `
    <section class="shop-grid">
      ${state.rewards.map((reward) => `
        <article class="reward-card">
          <button class="delete-dot item-delete" data-delete-reward="${reward.id}" aria-label="删除奖励">×</button>
          <strong>${escapeHtml(reward.name)}</strong>
          <span>${reward.cost}分</span>
          <button data-reward-id="${reward.id}">兑换</button>
        </article>
      `).join('')}
    </section>
  `
}

function renderAchievements() {
  const progress = gachaProgress()
  const progressPercent = (progress.towardNext / GACHA_TASK_TARGET) * 100
  const reward = state.lastGachaReward
  const isSpinning = gachaAnimation === 'spinning'
  const spinLabel = isSpinning ? '正在掉落...' : progress.available ? '扭一次' : '继续完成任务'
  return `
    <section class="achievement-grid">
      <div class="achievement-stats">
        <article class="cat-stat cat-today"><div class="cat-badge"><strong>${state.completions[todayKey()] || 0}</strong></div><span>今日完成</span></article>
        <article class="cat-stat cat-total"><div class="cat-badge"><strong>${state.completedTotal}</strong></div><span>累计完成</span></article>
        <article class="cat-stat cat-streak"><div class="cat-badge"><strong>${streakDays()}</strong></div><span>连续完成</span></article>
      </div>
      <article class="gacha-card ${gachaAnimation}">
        <div class="gacha-title">
          <strong>莓莓好运扭蛋机</strong>
          <span>机会 ${progress.available} 次</span>
        </div>
        <div class="gacha-machine-wrap">
          <img class="gacha-machine" src="./assets/gacha-machine-cutout.png" alt="莓莓好运扭蛋机" />
          <i class="gacha-capsule" aria-hidden="true"></i>
        </div>
        <p class="gacha-copy">每完成 5 个任务，获得 1 次抽奖机会</p>
        <div class="gacha-progress" aria-label="距离下一次抽奖还差 ${progress.remaining} 个任务">
          <i style="width: ${progressPercent}%"></i>
        </div>
        <small>进度 ${progress.towardNext}/${GACHA_TASK_TARGET} · 还差 ${progress.remaining} 个任务</small>
        <button class="gacha-spin" data-gacha-spin ${progress.available && !isSpinning ? '' : 'disabled'}>${spinLabel}</button>
        ${reward ? `<p class="gacha-result ${isSpinning ? '' : 'show'}">最近好运：+${reward.points} 分</p>` : ''}
      </article>
    </section>
  `
}

function monthlyHeatmapLabel() {
  const { year, month } = selectedDateParts()
  return `${year}年${month}月`
}

function renderMonthlyHeatmap() {
  const { year, month } = selectedDateParts()
  const first = new Date(year, month - 1, 1)
  const startOffset = first.getDay()
  const days = new Date(year, month, 0).getDate()
  const cells = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ]

  return `
    <div class="month-heatmap">
      ${['日', '一', '二', '三', '四', '五', '六'].map((day) => `<span>${day}</span>`).join('')}
      ${cells.map((day) => {
        if (!day) return '<i class="blank"></i>'
        const key = toDateKey(new Date(year, month - 1, day))
        const count = state.completions[key] || 0
        const isPicked = key === state.selectedDate
        const level = count >= 8 ? 4 : count >= 5 ? 3 : count >= 3 ? 2 : count >= 1 ? 1 : 0
        return `<i class="level-${level} ${isPicked ? 'picked' : ''}" title="${count} 个完成"><b>${day}</b></i>`
      }).join('')}
    </div>
  `
}

function renderCalendar() {
  const year = calendarCursor.getFullYear()
  const month = calendarCursor.getMonth()
  const first = new Date(year, month, 1)
  const startOffset = first.getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: startOffset }, () => ''),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ]

  openModal(`
    <div class="calendar">
      <div class="calendar-head">
        <button class="calendar-year" data-cal-year-toggle>${year}</button>
      </div>
      ${calendarYearOpen ? `
        <div class="year-grid compact-years">
          ${Array.from({ length: 9 }, (_, index) => year - 4 + index).map((item) => `<button class="${item === year ? 'picked' : ''}" data-year="${item}">${item}</button>`).join('')}
        </div>
      ` : ''}
      <div class="month-scroll calendar-months">
        ${Array.from({ length: 12 }, (_, index) => index + 1).map((item) => `
          <button class="${item === month + 1 ? 'active' : ''}" data-month="${item}">${monthLabel(item)}</button>
        `).join('')}
      </div>
      <div class="week-row">${['日', '一', '二', '三', '四', '五', '六'].map((day) => `<span>${day}</span>`).join('')}</div>
      <div class="day-grid">
        ${cells.map((day) => {
          if (!day) return '<span></span>'
          const key = toDateKey(new Date(year, month, day))
          return `<button class="${key === state.selectedDate ? 'picked' : ''}" data-date="${key}">${day}</button>`
        }).join('')}
      </div>
    </div>
  `)
}

function openAddModal() {
  if (state.activeView === 'habits') {
    return openModal(`
      <form class="modal-form" data-form="habit">
        <h2>添加习惯</h2>
        <label>习惯名称<input name="name" autocomplete="off" required /></label>
        <label>从哪天开始<input name="startDate" type="date" value="${state.selectedDate}" required /></label>
        <label>做到哪天<input name="endDate" type="date" value="${addDays(state.selectedDate, 20)}" data-habit-end required /></label>
        <label class="check-field"><input name="permanent" type="checkbox" data-habit-permanent /> 永久</label>
        <button type="submit">保存</button>
      </form>
    `)
  }
  if (state.activeView === 'shop') {
    return openModal(`
      <form class="modal-form" data-form="reward">
        <h2>添加奖励</h2>
        <label>奖励名称<input name="name" autocomplete="off" required /></label>
        <label>所需积分<input name="cost" type="number" min="1" value="20" required /></label>
        <button type="submit">保存</button>
      </form>
    `)
  }
  openModal(`
    <form class="modal-form" data-form="task">
      <h2>添加任务</h2>
      <label>任务名称<input name="title" autocomplete="off" required /></label>
      <label>备注<textarea name="note" rows="1"></textarea></label>
      ${renderTaskDateField('所属日期', 'date', state.selectedDate)}
      ${renderTaskDateField('做到哪天', 'endDate', state.selectedDate)}
      <label>所属象限
        <select name="quadrant">
          ${Object.entries(quadrantNames).map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}
        </select>
      </label>
      <button type="submit">保存</button>
    </form>
  `)
}

function renderTaskDateField(label, name, value) {
  return `
    <label class="pretty-date-field">${label}
      <input name="${name}" type="hidden" value="${value}" required />
      <button type="button" data-date-picker="${name}">${shortDate(value)}</button>
    </label>
  `
}

function openTaskDatePicker(targetName) {
  const input = document.querySelector(`input[name="${targetName}"]`)
  if (!input) return
  const value = input.value || state.selectedDate
  taskDatePicker = {
    targetName,
    cursor: new Date(`${value}T00:00:00`),
  }
  renderTaskDatePicker()
}

function renderTaskDatePicker() {
  const form = document.querySelector('[data-form="task"]')
  if (!form || !taskDatePicker) return
  form.querySelector('.task-date-picker')?.remove()

  const input = form.querySelector(`input[name="${taskDatePicker.targetName}"]`)
  const picked = input?.value || state.selectedDate
  const year = taskDatePicker.cursor.getFullYear()
  const month = taskDatePicker.cursor.getMonth()
  const first = new Date(year, month, 1)
  const startOffset = first.getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: startOffset }, () => ''),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ]

  const picker = document.createElement('div')
  picker.className = 'task-date-picker'
  picker.innerHTML = `
    <div class="calendar-head compact-calendar-head">
      <button type="button" data-picker-month="-1">‹</button>
      <strong>${year}年${month + 1}月</strong>
      <button type="button" data-picker-month="1">›</button>
    </div>
    <div class="week-row">${['日', '一', '二', '三', '四', '五', '六'].map((day) => `<span>${day}</span>`).join('')}</div>
    <div class="day-grid">
      ${cells.map((day) => {
        if (!day) return '<span></span>'
        const key = toDateKey(new Date(year, month, day))
        return `<button type="button" class="${key === picked ? 'picked' : ''}" data-picker-date="${key}">${day}</button>`
      }).join('')}
    </div>
  `

  const target = form.querySelector(`[data-date-picker="${taskDatePicker.targetName}"]`)?.closest('label')
  target?.after(picker)
  bindTaskDatePickerEvents()
}

function bindTaskDatePickerEvents() {
  document.querySelectorAll('[data-picker-month]').forEach((button) => {
    button.addEventListener('click', () => {
      taskDatePicker.cursor.setMonth(taskDatePicker.cursor.getMonth() + Number(button.dataset.pickerMonth))
      renderTaskDatePicker()
    })
  })
  document.querySelectorAll('[data-picker-date]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.querySelector(`input[name="${taskDatePicker.targetName}"]`)
      const trigger = document.querySelector(`[data-date-picker="${taskDatePicker.targetName}"]`)
      if (input) input.value = button.dataset.pickerDate
      if (trigger) trigger.textContent = shortDate(button.dataset.pickerDate)
      document.querySelector('.task-date-picker')?.remove()
      taskDatePicker = null
    })
  })
}

function openStartupPrompt() {
  openModal(`
    <div class="modal-form">
      <h2>已经走过 5 分钟啦</h2>
      <p>现在想怎么处理这张卡片？</p>
      <div class="prompt-actions">
        <button data-action="continue-timer">继续</button>
        <button data-action="pause-timer">暂停</button>
        <button data-action="finish-timer">完成</button>
        <button data-action="rest-timer">休息</button>
      </div>
    </div>
  `)
}

function openModal(content) {
  closeModal()
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal-card" onclick="event.stopPropagation()">
        <button class="modal-close" data-action="close-modal">×</button>
        ${content}
      </section>
    </div>
  `)
  bindModalEvents()
}

function enhanceTaskModal() {
  const form = document.querySelector('[data-form="task"]')
  const dateInput = form?.querySelector('input[name="date"]')
  const select = form?.querySelector('select[name="quadrant"]')
  if (!form || !dateInput || !select) return

  if (!form.querySelector('input[name="endDate"]')) {
    const endLabel = document.createElement('label')
    endLabel.textContent = '做到哪天'
    const endInput = document.createElement('input')
    endInput.name = 'endDate'
    endInput.type = 'date'
    endInput.value = dateInput.value || state.selectedDate
    endInput.required = true
    endLabel.append(endInput)
    dateInput.closest('label')?.after(endLabel)
  }

  if (select && !select.querySelector(`option[value="${MAJOR_EVENT}"]`)) {
    const option = document.createElement('option')
    option.value = MAJOR_EVENT
    option.textContent = '重大事件'
    select.append(option)
  }

  const pointLabel = document.createElement('label')
  pointLabel.className = 'custom-points-field'
  pointLabel.textContent = `重大事件积分（最高 ${MAJOR_EVENT_MAX_POINTS}）`
  const pointInput = document.createElement('input')
  pointInput.name = 'customPoints'
  pointInput.type = 'number'
  pointInput.min = '1'
  pointInput.max = String(MAJOR_EVENT_MAX_POINTS)
  pointInput.value = '30'
  pointLabel.append(pointInput)
  select?.closest('label')?.after(pointLabel)

  const syncCustomPoints = () => {
    pointLabel.hidden = select?.value !== MAJOR_EVENT
    pointInput.disabled = select?.value !== MAJOR_EVENT
  }
  select?.addEventListener('change', syncCustomPoints)
  syncCustomPoints()
}

function closeModal() {
  document.querySelector('.modal-backdrop')?.remove()
}

function updateAvatar(file) {
  if (!file || !file.type.startsWith('image/')) return toast('请选择图片文件')
  const image = new Image()
  const url = URL.createObjectURL(file)
  image.addEventListener('load', () => {
    const size = 512
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) {
      URL.revokeObjectURL(url)
      return toast('头像处理失败')
    }
    const scale = Math.max(size / image.width, size / image.height)
    const width = image.width * scale
    const height = image.height * scale
    canvas.width = size
    canvas.height = size
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
    URL.revokeObjectURL(url)
    state.avatarImage = canvas.toDataURL('image/jpeg', 0.86)
    saveState()
    render()
    openProfileModal()
  })
  image.addEventListener('error', () => {
    URL.revokeObjectURL(url)
    toast('头像读取失败')
  })
  image.src = url
}

function exportState() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `berry-todo-${todayKey()}.json`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function importState(file) {
  if (!file) return
  const reader = new FileReader()
  reader.addEventListener('load', () => {
    try {
      const imported = JSON.parse(reader.result)
      const defaults = defaultState()
      state = {
        ...defaults,
        ...imported,
        scoreRules: { ...defaults.scoreRules, ...(imported.scoreRules || {}) },
        tasks: (imported.tasks || defaults.tasks).map(normalizeTask),
      }
      calendarCursor = new Date(`${state.selectedDate}T00:00:00`)
      saveState()
      closeModal()
      render()
      toast('已导入')
    } catch {
      toast('导入失败')
    }
  })
  reader.readAsText(file)
}

function bindEvents() {
  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', handleAction)
  })
  document.querySelectorAll('.card-actions button').forEach((button) => {
    button.addEventListener('pointerdown', (event) => event.stopPropagation())
    button.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true })
  })
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeView = button.dataset.view
      if (button.dataset.view === 'quadrants') {
        state.selectedDate = todayKey()
        state.lastSeenDate = todayKey()
        calendarCursor = new Date(`${state.selectedDate}T00:00:00`)
      }
      profileOpen = false
      saveState()
      render()
    })
  })
  document.querySelectorAll('[data-score-rule]').forEach((input) => {
    input.addEventListener('change', () => updateScoreRule(input.dataset.scoreRule, input.value))
  })
  document.querySelectorAll('[data-timer-mode]').forEach((button) => {
    button.addEventListener('click', () => switchTimerMode(button.dataset.timerMode))
  })
  bindCountdownPicker()
  document.querySelectorAll('[data-task-id]').forEach((button) => {
    bindLongPress(button, () => setTomorrowFirst(button.dataset.taskId))
  })
  document.querySelectorAll('[data-complete-task]').forEach((button) => {
    button.addEventListener('click', () => completeTask(button.dataset.completeTask, state.selectedDate))
  })
  document.querySelectorAll('[data-habit-id]').forEach((button) => {
    button.addEventListener('click', () => checkHabit(button.dataset.habitId))
  })
  document.querySelectorAll('[data-reward-id]').forEach((button) => {
    button.addEventListener('click', () => redeemReward(button.dataset.rewardId))
  })
  document.querySelector('[data-gacha-spin]')?.addEventListener('click', spinGacha)
  document.querySelectorAll('[data-delete-task]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      deleteTask(button.dataset.deleteTask)
    })
  })
  document.querySelectorAll('[data-delete-habit]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      deleteHabit(button.dataset.deleteHabit)
    })
  })
  document.querySelectorAll('[data-delete-reward]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      deleteReward(button.dataset.deleteReward)
    })
  })
  document.querySelectorAll('[data-heatmap-month]').forEach((button) => {
    button.addEventListener('click', () => {
      setSelectedMonth(selectedDateParts().month + Number(button.dataset.heatmapMonth))
      render()
    })
  })
  const swipeCard = document.querySelector('[data-swipe-card]')
  if (swipeCard) bindSwipe(swipeCard)
  const cardShell = document.querySelector('.card-shell')
  if (cardShell) bindWheelSwipe(cardShell)
}

function bindModalEvents() {
  document.querySelectorAll('.modal-backdrop [data-action]').forEach((button) => {
    button.addEventListener('click', handleAction)
  })
  document.querySelectorAll('.modal-backdrop [data-score-rule]').forEach((input) => {
    input.addEventListener('change', () => updateScoreRule(input.dataset.scoreRule, input.value))
  })
  document.querySelector('[data-avatar-upload]')?.addEventListener('change', (event) => {
    updateAvatar(event.currentTarget.files?.[0])
  })
  document.querySelector('[data-export-state]')?.addEventListener('click', exportState)
  document.querySelector('[data-import-state]')?.addEventListener('change', (event) => {
    importState(event.currentTarget.files?.[0])
  })
  document.querySelectorAll('[data-rollover-move]').forEach((button) => {
    button.addEventListener('click', () => moveRolloverTask(button.dataset.rolloverMove))
  })
  document.querySelectorAll('[data-rollover-delete]').forEach((button) => {
    button.addEventListener('click', () => discardRolloverTask(button.dataset.rolloverDelete))
  })
  const permanentToggle = document.querySelector('[data-habit-permanent]')
  const habitEndInput = document.querySelector('[data-habit-end]')
  if (permanentToggle && habitEndInput) {
    const syncPermanent = () => {
      habitEndInput.disabled = permanentToggle.checked
      habitEndInput.closest('label')?.classList.toggle('is-disabled', permanentToggle.checked)
    }
    permanentToggle.addEventListener('change', syncPermanent)
    syncPermanent()
  }
  document.querySelectorAll('[data-date-picker]').forEach((button) => {
    button.addEventListener('click', () => openTaskDatePicker(button.dataset.datePicker))
  })
  document.querySelectorAll('[data-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      if (form.dataset.form === 'task') addTask(form)
      if (form.dataset.form === 'habit') addHabit(form)
      if (form.dataset.form === 'reward') addReward(form)
    })
  })
  document.querySelectorAll('[data-cal]').forEach((button) => {
    button.addEventListener('click', () => {
      calendarCursor.setMonth(calendarCursor.getMonth() + (button.dataset.cal === 'next' ? 1 : -1))
      renderCalendar()
    })
  })
  document.querySelectorAll('[data-cal-year-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      calendarYearOpen = !calendarYearOpen
      renderCalendar()
    })
  })
  document.querySelectorAll('[data-month]').forEach((button) => {
    button.addEventListener('click', () => {
      setSelectedMonth(Number(button.dataset.month))
      calendarCursor = new Date(`${state.selectedDate}T00:00:00`)
      calendarYearOpen = false
      renderCalendar()
    })
  })
  document.querySelectorAll('[data-date]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedDate = button.dataset.date
      calendarCursor = new Date(`${state.selectedDate}T00:00:00`)
      saveState()
      closeModal()
      render()
    })
  })
  document.querySelectorAll('[data-year]').forEach((button) => {
    button.addEventListener('click', () => {
      setSelectedYear(Number(button.dataset.year))
      calendarCursor = new Date(`${state.selectedDate}T00:00:00`)
      calendarYearOpen = false
      renderCalendar()
    })
  })
}

function handleAction(event) {
  const action = event.currentTarget.dataset.action
  if (action === 'main') screen = 'main'
  if (action === 'card') screen = 'card'
  if (action === 'timer') startTimerForCard()
  if (action === 'next-card') nextCard()
  if (action === 'complete-card') completeTask(currentCardTask()?.id)
  if (action === 'add') {
    profileOpen = false
    document.querySelector('.profile-menu')?.remove()
    openAddModal()
    enhanceTaskModal()
  }
  if (action === 'calendar') {
    calendarYearOpen = false
    renderCalendar()
  }
  if (action === 'profile') profileOpen = !profileOpen
  if (action === 'open-profile-modal') openProfileModal()
  if (action === 'open-sync-modal') openSyncModal()
  if (action === 'undo') undoLastAction()
  if (action === 'toggle-delete') isDeleteMode = !isDeleteMode
  if (action === 'close-modal') {
    if (rolloverPromptOpen) markRolloverReviewed()
    else closeModal()
  }
  if (action === 'rollover-dismiss') markRolloverReviewed()
  if (action === 'toggle-timer') toggleTimer()
  if (action === 'pause-timer') pauseTimer()
  if (action === 'continue-timer') {
    closeModal()
    startTimer()
  }
  if (action === 'finish-timer') finishTimer()
  if (action === 'rest-timer') restTimer()
  renderIfNeeded(action)
}

function renderIfNeeded(action) {
  const noRender = ['add', 'calendar', 'close-modal', 'continue-timer', 'open-profile-modal', 'open-sync-modal', 'rollover-dismiss']
  if (!noRender.includes(action)) render()
}

function nextCard() {
  const queue = cardQueue()
  if (queue.length) cardIndex = (cardIndex + 1) % queue.length
}

function startTimerForCard() {
  const task = currentCardTask()
  if (!task) return
  activeTimerTaskId = task.id
  screen = 'timer'
  switchTimerMode('startup', false)
}

function runCardSwipe(dx, dy) {
  if (Date.now() - lastSwipeAt < 260) return
  lastSwipeAt = Date.now()

  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 52) {
    dx < 0 ? startTimerForCard() : completeTask(currentCardTask()?.id)
    render()
    return
  }

  if (Math.abs(dy) > Math.abs(dx) && dy < -52) {
    nextCard()
    render()
  }
}

function switchTimerMode(mode, shouldRender = true) {
  timerMode = mode
  timerRunning = false
  startupPromptShown = false
  clearInterval(timerInterval)
  if (mode === 'countdown') timerSeconds = countdownSeconds()
  else if (mode === 'pomodoro') timerSeconds = 1500
  else timerSeconds = 0
  timerTarget = mode === 'pomodoro' ? 1500 : mode === 'countdown' ? timerSeconds : 300
  if (shouldRender) render()
}

function countdownSeconds() {
  return countdownSelection.hours * 3600 + countdownSelection.minutes * 60 + countdownSelection.seconds
}

function setCountdownUnit(unit, value) {
  if (!(unit in countdownSelection)) return
  countdownSelection[unit] = Math.max(0, Number(value) || 0)
  timerSeconds = countdownSeconds()
  timerTarget = timerSeconds
}

function bindCountdownPicker() {
  document.querySelectorAll('[data-countdown-wheel]').forEach((wheel) => {
    const unit = wheel.dataset.countdownWheel
    const max = Number(wheel.dataset.max)
    const itemHeight = 40
    let settleTimer = null
    const pickValue = (value) => {
      const picked = Math.max(0, Math.min(max, Number(value) || 0))
      setCountdownUnit(unit, picked)
      wheel.querySelectorAll('[data-countdown-value]').forEach((button) => {
        const selected = Number(button.dataset.countdownValue) === picked
        button.classList.toggle('picked', selected)
        button.setAttribute('aria-selected', String(selected))
      })
    }
    wheel.scrollTop = countdownSelection[unit] * itemHeight
    wheel.addEventListener('scroll', () => {
      clearTimeout(settleTimer)
      settleTimer = setTimeout(() => {
        const picked = Math.round(wheel.scrollTop / itemHeight)
        pickValue(picked)
        wheel.scrollTo({ top: picked * itemHeight, behavior: 'smooth' })
      }, 90)
    })
    wheel.querySelectorAll('[data-countdown-value]').forEach((button) => {
      button.addEventListener('click', () => {
        const picked = Number(button.dataset.countdownValue)
        pickValue(picked)
        wheel.scrollTo({ top: picked * itemHeight, behavior: 'smooth' })
      })
    })
  })
}

function syncCountdownSelection(seconds) {
  countdownSelection = {
    hours: Math.floor(seconds / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  }
}

function toggleTimer() {
  if (timerMode === 'countdown' && !timerRunning && timerSeconds === 0) return toast('请先选择倒计时时间')
  timerRunning ? pauseTimer() : startTimer()
}

function startTimer() {
  timerRunning = true
  clearInterval(timerInterval)
  timerInterval = setInterval(() => {
    if (timerMode === 'countdown' || timerMode === 'pomodoro') {
      timerSeconds = Math.max(0, timerSeconds - 1)
      if (timerSeconds === 0) {
        pauseTimer()
        render()
      }
    } else {
      timerSeconds += 1
    }
    const display = document.querySelector('.timer-display')
    if (display) display.textContent = formatTimer(timerSeconds, timerMode)
  }, 1000)
}

function pauseTimer() {
  timerRunning = false
  clearInterval(timerInterval)
  if (timerMode === 'countdown') syncCountdownSelection(timerSeconds)
  closeModal()
}

function finishTimer() {
  pauseTimer()
  closeModal()
  if (activeTimerTaskId) completeTask(activeTimerTaskId)
  screen = 'card'
}

function restTimer() {
  pauseTimer()
  closeModal()
  timerSeconds = 0
  if (timerMode === 'countdown') syncCountdownSelection(0)
}

function bindSwipe(element) {
  element.addEventListener('pointerdown', (event) => {
    touchStart = { x: event.clientX, y: event.clientY }
    element.setPointerCapture?.(event.pointerId)
    element.classList.add('is-dragging')
  })
  element.addEventListener('pointermove', (event) => {
    if (!touchStart) return
    const dx = event.clientX - touchStart.x
    const dy = event.clientY - touchStart.y
    element.style.transform = `translate(${dx * 0.18}px, ${dy * 0.12}px) rotate(${dx * 0.025}deg)`
  })
  element.addEventListener('pointerup', (event) => {
    if (!touchStart) return
    const dx = event.clientX - touchStart.x
    const dy = event.clientY - touchStart.y
    element.classList.remove('is-dragging')
    element.style.transform = ''
    touchStart = null
    runCardSwipe(dx, dy)
  })
  element.addEventListener('pointercancel', () => {
    touchStart = null
    element.classList.remove('is-dragging')
    element.style.transform = ''
  })
  element.addEventListener('touchstart', (event) => {
    const touch = event.touches[0]
    touchStart = { x: touch.clientX, y: touch.clientY }
  }, { passive: true })
  element.addEventListener('touchend', (event) => {
    if (!touchStart) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - touchStart.x
    const dy = touch.clientY - touchStart.y
    touchStart = null
    runCardSwipe(dx, dy)
  }, { passive: true })
}

function bindWheelSwipe(element) {
  let wheelX = 0
  let wheelY = 0
  let wheelTimer = null

  element.addEventListener('wheel', (event) => {
    if (screen !== 'card') return
    event.preventDefault()
    wheelX += event.deltaX
    wheelY += event.deltaY
    clearTimeout(wheelTimer)
    wheelTimer = setTimeout(() => {
      const dx = wheelX
      const dy = wheelY
      wheelX = 0
      wheelY = 0
      runCardSwipe(dx, dy)
    }, 90)
  }, { passive: false })
}

function bindLongPress(element, callback) {
  element.addEventListener('pointerdown', () => {
    pressTimer = setTimeout(callback, 520)
  })
  element.addEventListener('pointerup', () => clearTimeout(pressTimer))
  element.addEventListener('pointerleave', () => clearTimeout(pressTimer))
}

window.addEventListener('pointerdown', () => {
  if (timerMode === 'startup' && timerRunning && timerSeconds >= 300 && !startupPromptShown && screen === 'timer') {
    startupPromptShown = true
    openStartupPrompt()
  }
})

function formatTimer(seconds, mode) {
  const value = Math.max(0, seconds)
  if (mode === 'countdown') {
    const hours = Math.floor(value / 3600)
    const minutes = Math.floor((value % 3600) / 60)
    const rest = value % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  }
  const minutes = Math.floor(value / 60)
  const rest = value % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

function timerHint() {
  if (timerMode === 'startup') return '5 分钟后会安静地继续正计时'
  if (timerMode === 'pomodoro') return '番茄时间到了会停在这里'
  if (timerMode === 'countdown') return '倒计结束后自动暂停'
  return '从现在开始记录投入了多久'
}

function viewTitle() {
  return {
    quadrants: '四象限',
    habits: '习惯',
    shop: '小卖部',
    achievements: '成就墙',
  }[state.activeView]
}

function streakDays() {
  let streak = 0
  let key = todayKey()
  while (state.completions[key]) {
    streak += 1
    key = addDays(key, -1)
  }
  return streak
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function toast(message) {
  document.querySelector('.toast')?.remove()
  document.body.insertAdjacentHTML('beforeend', `<div class="toast">${message}</div>`)
  setTimeout(() => document.querySelector('.toast')?.remove(), 1500)
}

render()
maybeOpenRolloverPrompt()

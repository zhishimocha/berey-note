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
  activeView: 'quadrants',
  points: 15,
  completedTotal: 2,
  completions: {},
  tomorrowFirst: {},
  scoreRules: defaultScoreRules,
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

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (!stored) return defaultState()
    const defaults = defaultState()
    const loaded = {
      ...defaults,
      ...stored,
      scoreRules: { ...defaults.scoreRules, ...(stored.scoreRules || {}) },
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

function visibleTasks(date = state.selectedDate) {
  return state.tasks
    .filter((task) => task.date === date && !task.done)
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

function completeTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId)
  if (!task || task.done) return
  const earnedPoints = taskScore(task)
  task.done = true
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
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const days = []
  const cursor = new Date(start)

  while (cursor <= end && days.length < 45) {
    days.push(toDateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  const createdAt = Date.now()
  const tasks = (days.length ? days : [startDate]).map((date, index) => ({
    id: crypto.randomUUID(),
    title,
    note,
    date,
    quadrant: category,
    points: customPoints,
    done: false,
    createdAt: createdAt + index,
  }))

  state.tasks.push(...tasks)
  state.lastAction = { type: 'addTask', taskIds: tasks.map((task) => task.id) }
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

function deleteTask(taskId) {
  state.tasks = state.tasks.filter((task) => task.id !== taskId)
  Object.keys(state.tomorrowFirst).forEach((key) => {
    if (state.tomorrowFirst[key] === taskId) delete state.tomorrowFirst[key]
  })
  saveState()
  render()
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
  return `
    <main class="shell timer-shell">
      <header class="topbar">
        <button class="soft-icon" data-action="card">‹</button>
        <div class="timer-title-card">
          <h1>${task ? escapeHtml(task.title) : '今天没有待办'}</h1>
        </div>
        <strong>${state.points}分</strong>
      </header>
      <nav class="mode-tabs">
        ${timerModes.map((mode) => `<button class="${mode.id === timerMode ? 'active' : ''}" data-timer-mode="${mode.id}">${mode.label}</button>`).join('')}
      </nav>
      <section class="timer-center ${timerMode}">
        <button class="timer-orb" data-action="toggle-timer">
          <span>${timerRunning ? display : timerMode === 'startup' ? '要不要来 5 分钟试试？' : display}</span>
        </button>
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

function renderMainScreen() {
  return `
    <main class="shell app-shell">
      <header class="main-header">
        ${state.activeView === 'quadrants'
          ? `<span class="date-pill">${shortDate(todayKey())}</span>`
          : '<div class="header-spacer"></div>'}
        <div class="points-center">
          <span>积分</span>
          <strong>${state.points}</strong>
        </div>
        <button class="avatar-button" data-action="profile" aria-label="头像菜单"></button>
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
  const rules = scoreRules()
  return `
    <section class="profile-menu">
      <button>个人资料</button>
      <button>同步设置</button>
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
    </section>
  `
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
  const majorTasks = visibleTasks().filter((task) => task.quadrant === MAJOR_EVENT)
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
              ${visibleTasks().filter((task) => task.quadrant === id).map(renderSmallTask).join('')}
            </div>
          </section>
        `).join('')}
      </div>
    </section>
  `
}

function renderSmallTask(task) {
  return `
    <button class="mini-task ${isDeleteMode ? 'is-deleting' : ''}" data-task-id="${task.id}">
      <span>${escapeHtml(task.title)}</span>
      ${task.note ? `<em>${escapeHtml(task.note)}</em>` : ''}
      <small>${taskCategoryName(task)} · +${taskScore(task)}分</small>
      ${isDeleteMode ? `<i class="delete-dot" data-delete-task="${task.id}">×</i>` : ''}
    </button>
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
          <button class="check-round ${habit.checkedDates.includes(todayKey()) ? 'done' : ''}" data-habit-id="${habit.id}"></button>
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
  return `
    <section class="achievement-grid">
      <div class="achievement-stats">
        <article class="cat-stat cat-today"><div class="cat-badge"><strong>${state.completions[todayKey()] || 0}</strong></div><span>今日完成</span></article>
        <article class="cat-stat cat-total"><div class="cat-badge"><strong>${state.completedTotal}</strong></div><span>累计完成</span></article>
        <article class="cat-stat cat-streak"><div class="cat-badge"><strong>${streakDays()}</strong></div><span>连续完成</span></article>
      </div>
      <article class="heatmap-card">
        <div class="heatmap-title">
          <button data-heatmap-month="-1">‹</button>
          <strong>${monthlyHeatmapLabel()}</strong>
          <button data-heatmap-month="1">›</button>
        </div>
        ${renderMonthlyHeatmap()}
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
  document.querySelectorAll('[data-task-id]').forEach((button) => {
    bindLongPress(button, () => setTomorrowFirst(button.dataset.taskId))
  })
  document.querySelectorAll('[data-habit-id]').forEach((button) => {
    button.addEventListener('click', () => checkHabit(button.dataset.habitId))
  })
  document.querySelectorAll('[data-reward-id]').forEach((button) => {
    button.addEventListener('click', () => redeemReward(button.dataset.rewardId))
  })
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
  if (action === 'undo') undoLastAction()
  if (action === 'toggle-delete') isDeleteMode = !isDeleteMode
  if (action === 'close-modal') closeModal()
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
  const noRender = ['add', 'calendar', 'close-modal', 'continue-timer']
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
  if (mode === 'countdown') timerSeconds = 600
  else if (mode === 'pomodoro') timerSeconds = 1500
  else timerSeconds = 0
  timerTarget = mode === 'pomodoro' ? 1500 : mode === 'countdown' ? 600 : 300
  if (shouldRender) render()
}

function toggleTimer() {
  timerRunning ? pauseTimer() : startTimer()
}

function startTimer() {
  timerRunning = true
  clearInterval(timerInterval)
  timerInterval = setInterval(() => {
    if (timerMode === 'countdown' || timerMode === 'pomodoro') {
      timerSeconds = Math.max(0, timerSeconds - 1)
      if (timerSeconds === 0) pauseTimer()
    } else {
      timerSeconds += 1
    }
    const display = document.querySelector('.timer-orb span')
    if (display) display.textContent = formatTimer(timerSeconds, timerMode)
  }, 1000)
}

function pauseTimer() {
  timerRunning = false
  clearInterval(timerInterval)
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

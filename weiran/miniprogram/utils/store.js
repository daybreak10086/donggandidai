const mock = require('./mock')
const academicRules = require('./academic-rules')

const KEYS = {
  currentStudentId: 'wr_current_student',
  session: 'wr_session_v2',
  settings: 'wr_settings_by_student',
  feedbacks: 'wr_feedbacks',
  actions: 'wr_actions',
  profile: 'wr_profile',
  credentials: 'wr_credentials',
  academic: 'wr_academic_runtime_v2',
  notifications: 'wr_notifications_v2'
}
const DEFAULT_SETTINGS = { showHealth: true, showMental: true, enableHealthAlert: true, enableEmotionAlert: true }
const PRIORITY = { academic: 1, health: 2, emotion: 3, contest: 4, resource: 5 }
function copy(value) { return JSON.parse(JSON.stringify(value)) }
function pad(n) { return ('0' + n).slice(-2) }
function formatTime(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) }
function unique(prefix) { return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9) }
function isStudent(id) { return mock.students.some(s => s.id === id) }
function getStudents() { return copy(mock.students) }
function getCurrentStudentId() {
  const session = wx.getStorageSync(KEYS.session)
  return session && isStudent(session.studentId) ? session.studentId : null
}
function studentIdOrThrow(id) {
  const sid = id || getCurrentStudentId()
  if (!isStudent(sid)) throw new Error('请先登录')
  return sid
}
function getStudent(id) { const sid = studentIdOrThrow(id); return copy(mock.students.find(s => s.id === sid)) }
function init() {
  // 旧版本曾自动设置黄同学，不能将那个 ID 当作已验证的登录会话。
  if (!getCurrentStudentId()) logout()
}
function setCurrentStudent(id, mode) {
  const sid = studentIdOrThrow(id)
  wx.setStorageSync(KEYS.session, { studentId: sid, mode: mode || 'local-mock', createdAt: formatTime(new Date()) })
  wx.setStorageSync(KEYS.currentStudentId, sid)
  syncNotifications(sid)
  evaluateAcademic(sid)
}
function logout() { wx.removeStorageSync(KEYS.session); wx.removeStorageSync(KEYS.currentStudentId) }
function requireSession() {
  if (getCurrentStudentId()) return true
  wx.reLaunch({ url: '/pages/login/login' })
  return false
}
function getSettings(studentId) {
  const sid = studentIdOrThrow(studentId)
  const all = wx.getStorageSync(KEYS.settings) || {}
  return Object.assign({}, DEFAULT_SETTINGS, all[sid] || {})
}
function updateSettings(patch) {
  const sid = studentIdOrThrow()
  const all = wx.getStorageSync(KEYS.settings) || {}
  const next = getSettings(sid)
  Object.keys(DEFAULT_SETTINGS).forEach(key => { if (typeof patch[key] === 'boolean') next[key] = patch[key] })
  all[sid] = next
  wx.setStorageSync(KEYS.settings, all)
  return next
}
function getProfile(studentId) {
  const sid = studentIdOrThrow(studentId)
  const s = getStudent(sid)
  const all = wx.getStorageSync(KEYS.profile) || {}
  return Object.assign({ nickname: s.nickname, avatarUrl: s.avatar || '', mbti: s.mbti }, all[sid] || {})
}
function updateProfile(studentId, patch) {
  const sid = studentIdOrThrow(studentId)
  const all = wx.getStorageSync(KEYS.profile) || {}
  const next = Object.assign({}, all[sid] || {}, patch)
  if (patch.nickname !== undefined) {
    next.nickname = patch.nickname.trim()
    if (!next.nickname || next.nickname.length > 20) throw new Error('昵称需为 1–20 个字符')
  }
  all[sid] = next
  wx.setStorageSync(KEYS.profile, all)
  return getProfile(sid)
}
function saveAvatar(tempFilePath, studentId) {
  const sid = studentIdOrThrow(studentId)
  const previous = getProfile(sid)
  return new Promise(function (resolve, reject) {
    if (!tempFilePath) { reject(new Error('未选择头像')); return }
    const fs = wx.getFileSystemManager()
    fs.saveFile({
      tempFilePath: tempFilePath,
      success: function (res) {
        try { updateProfile(sid, { avatarUrl: res.savedFilePath, avatarPersisted: true }) }
        catch (error) { reject(error); return }
        // 仅清理本功能之前保存的头像，不删除其他业务文件。
        if (previous.avatarPersisted && previous.avatarUrl && previous.avatarUrl !== res.savedFilePath) {
          fs.removeSavedFile({ filePath: previous.avatarUrl, fail: function () {} })
        }
        resolve(res.savedFilePath)
      },
      fail: reject
    })
  })
}
function getStudentView(id) {
  const s = getStudent(id)
  const p = getProfile(id)
  const w = getAcademicWarning(s.id)
  s.warnings.academic = w || Object.assign({}, s.warnings.academic, { level: 'none', value: 0 })
  return Object.assign({}, s, p, { avatarText: (p.nickname || s.nickname).charAt(0) })
}
function getAccountInfo(studentId) {
  const sid = studentIdOrThrow(studentId)
  const s = getStudent(sid)
  const all = wx.getStorageSync(KEYS.credentials) || {}
  return Object.assign({ account: s.account, password: s.password }, all[sid] || {})
}
function updateAccountInfo(studentId, patch) {
  const sid = studentIdOrThrow(studentId)
  const account = (patch.account || '').trim()
  if (!account || !patch.password || patch.password.length < 6) throw new Error('请填写账号和至少 6 位密码')
  if (mock.students.some(s => s.id !== sid && getAccountInfo(s.id).account === account)) throw new Error('该账号已被其他学生使用')
  const all = wx.getStorageSync(KEYS.credentials) || {}
  all[sid] = { account: account, password: patch.password }
  wx.setStorageSync(KEYS.credentials, all)
}
function login(account, password) {
  const student = mock.students.find(s => { const c = getAccountInfo(s.id); return c.account === account && c.password === password })
  return student ? student.id : null
}
function warningLevelLabel(level) { return (mock.warningLevelMap[level] || mock.warningLevelMap.none).label }
function warningLevelClass(level) { return (mock.warningLevelMap[level] || mock.warningLevelMap.none).cls }
function notificationAllowed(message, settings) {
  if ((message.type === 'health' || message.topic === 'health') && !settings.enableHealthAlert) return false
  if ((message.type === 'emotion' || message.topic === 'mental') && !settings.enableEmotionAlert) return false
  return true
}
function enqueueNotification(studentId, message) {
  const sid = studentIdOrThrow(studentId)
  if (!notificationAllowed(message, getSettings(sid))) return false
  const all = wx.getStorageSync(KEYS.notifications) || {}
  const list = all[sid] || []
  if (list.some(n => n.id === message.id)) return false
  list.push(Object.assign({}, copy(message), { deliveredAt: formatTime(new Date()), channel: 'local-mock', read: false }))
  all[sid] = list
  wx.setStorageSync(KEYS.notifications, all)
  return true
}
function syncNotifications(studentId) {
  const sid = studentIdOrThrow(studentId)
  getStudent(sid).notifications.forEach(n => enqueueNotification(sid, n))
}
function getMessages(studentId) {
  const sid = studentIdOrThrow(studentId)
  syncNotifications(sid)
  const all = wx.getStorageSync(KEYS.notifications) || {}
  const settings = getSettings(sid)
  return (all[sid] || []).filter(n => notificationAllowed(n, settings)).sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type])
}
function markMessageRead(id) {
  const sid = studentIdOrThrow()
  if (!getMessages(sid).some(n => n.id === id)) return
  const all = wx.getStorageSync(KEYS.notifications) || {}
  const message = (all[sid] || []).find(n => n.id === id)
  if (message) { message.read = true; wx.setStorageSync(KEYS.notifications, all) }
}
function getRecommendations(id) { return getMessages(id).filter(n => n.type === 'contest' || n.type === 'resource') }

function getAcademicState(studentId) {
  const sid = studentIdOrThrow(studentId)
  const all = wx.getStorageSync(KEYS.academic) || {}
  if (!all[sid]) {
    all[sid] = { warning: getStudent(sid).warnings.academic, asOf: mock.DEMO_DATE, events: [] }
    wx.setStorageSync(KEYS.academic, all)
  }
  return all[sid]
}
function saveAcademicState(studentId, state) {
  const all = wx.getStorageSync(KEYS.academic) || {}
  all[studentIdOrThrow(studentId)] = state
  wx.setStorageSync(KEYS.academic, all)
}
function warningView(state) {
  const w = copy(state.warning)
  if (w.level === 'none') return null
  w.history = (w.history || []).filter(p => p.date <= state.asOf).sort((a, b) => a.date.localeCompare(b.date))
  if (!w.history.length) return null
  w.value = w.history[w.history.length - 1].value
  w.trend = w.history.map(p => p.value)
  w.trendLabels = w.history.map(p => p.date.slice(5))
  return w
}
function getAcademicWarning(studentId) { return warningView(getAcademicState(studentId)) }
function getAcademicStatus(studentId) {
  const state = getAcademicState(studentId)
  return Object.assign({ asOf: state.asOf }, academicRules.evaluate(warningView(state), state.asOf))
}
function getAcademicEscalation(studentId) { return getAcademicStatus(studentId).escalate }
function appendEvent(state, sid, recipient, kind, reason) {
  const id = state.warning.id + ':' + kind
  if (state.events.some(e => e.id === id)) return
  state.events.push({ id: id, warningId: state.warning.id, studentId: sid, recipient: recipient, kind: kind, reason: reason,
    date: recipient === 'student' ? state.warning.firstNotifiedAt : state.asOf,
    recordedAt: formatTime(new Date()), channel: 'local-mock',
    status: recipient === 'student' ? '已生成学生站内提醒' : '待接入辅导员服务' })
}
function evaluateAcademic(studentId) {
  const sid = studentIdOrThrow(studentId)
  const state = getAcademicState(sid)
  const w = warningView(state)
  if (!w) return getAcademicStatus(sid)
  appendEvent(state, sid, 'student', 'student-notified', '学业预警先提醒学生本人')
  const result = academicRules.evaluate(w, state.asOf)
  if (result.escalate) appendEvent(state, sid, 'counselor', 'no-improvement', result.reason)
  saveAcademicState(sid, state)
  return Object.assign({ asOf: state.asOf }, result)
}
function getAcademicEvents(studentId) { return copy(getAcademicState(studentId).events) }
function getCounselorEvents(studentId) { return getAcademicEvents(studentId).filter(e => e.recipient === 'counselor') }
function advanceAcademicDemo(improve) {
  const sid = studentIdOrThrow()
  const state = getAcademicState(sid)
  const w = warningView(state)
  if (!w) return
  state.asOf = academicRules.addDays(state.asOf, 7)
  const value = Math.max(0, w.value - (improve ? 10 : 0))
  state.warning.history.push({ date: state.asOf, value: value })
  state.warning.value = value
  if (value === 0) state.warning.level = 'none'
  saveAcademicState(sid, state)
  evaluateAcademic(sid)
}
function resetAcademicDemo() {
  const sid = studentIdOrThrow()
  const w = getStudent(sid).warnings.academic
  if (w.level === 'none') return
  w.history = w.history.slice(0, 1)
  w.value = w.history[0].value
  saveAcademicState(sid, { warning: w, asOf: w.firstNotifiedAt, events: [] })
  const all = wx.getStorageSync(KEYS.actions) || {}
  all[sid] = []
  wx.setStorageSync(KEYS.actions, all)
  evaluateAcademic(sid)
}
function getAlertActions(studentId) {
  const sid = studentIdOrThrow(studentId)
  const all = wx.getStorageSync(KEYS.actions) || {}
  return all[sid] || []
}
function addAlertAction(studentId, action, note) {
  const sid = studentIdOrThrow(studentId)
  const warning = getAcademicWarning(sid)
  if (!warning) throw new Error('当前没有待处理学业预警')
  if (['自助处理', '请求辅导员帮助', '忽略'].indexOf(action) < 0) throw new Error('无效的处理方式')
  evaluateAcademic(sid)
  const all = wx.getStorageSync(KEYS.actions) || {}
  const list = all[sid] || []
  list.unshift({ id: unique('act'), warningId: warning.id, action: action, note: note, time: formatTime(new Date()) })
  all[sid] = list
  wx.setStorageSync(KEYS.actions, all)
  if (action === '请求辅导员帮助') {
    const state = getAcademicState(sid)
    appendEvent(state, sid, 'counselor', 'student-request', '学生主动请求辅导员帮助')
    saveAcademicState(sid, state)
  }
  return list
}
function getFeedbacks(studentId) {
  const sid = studentIdOrThrow(studentId)
  return (wx.getStorageSync(KEYS.feedbacks) || []).filter(f => f.studentId === sid)
}
function addFeedback(item) {
  const sid = studentIdOrThrow()
  const reason = (item.reason || '').trim()
  if (!reason || reason.length > 500) throw new Error('请填写 1–500 字的反馈说明')
  if (['错误数据', '缺失数据'].indexOf(item.type) < 0) throw new Error('反馈类型无效')
  if (['学习状态', '身体健康', '心理健康', '性格与兴趣'].indexOf(item.dimension) < 0) throw new Error('反馈维度无效')
  const list = wx.getStorageSync(KEYS.feedbacks) || []
  const fb = { id: unique('fb'), studentId: sid, studentName: getStudent(sid).name, type: item.type,
    dimension: item.dimension, reason: reason, status: '待处理', createdAt: formatTime(new Date()) }
  list.unshift(fb)
  wx.setStorageSync(KEYS.feedbacks, list)
  return fb
}
// 预留给后续反馈处理适配层；学生界面不提供更改状态按钮。
function updateFeedbackStatus(id, status) {
  if (['待处理', '已处理'].indexOf(status) < 0) throw new Error('反馈状态无效')
  const sid = studentIdOrThrow()
  const list = wx.getStorageSync(KEYS.feedbacks) || []
  const target = list.find(f => f.id === id && f.studentId === sid)
  if (target) { target.status = status; target.updatedAt = formatTime(new Date()); wx.setStorageSync(KEYS.feedbacks, list) }
  return getFeedbacks(sid)
}
module.exports = {
  init, getStudents, getStudent, getCurrentStudentId, setCurrentStudent, requireSession, logout,
  getSettings, updateSettings, getProfile, updateProfile, saveAvatar, getStudentView,
  getAccountInfo, updateAccountInfo, login, warningLevelLabel, warningLevelClass,
  enqueueNotification, syncNotifications, getMessages, markMessageRead, getRecommendations,
  getAcademicWarning, getAcademicStatus, getAcademicEscalation, evaluateAcademic,
  getAcademicEvents, getCounselorEvents, advanceAcademicDemo, resetAcademicDemo,
  getFeedbacks, addFeedback, updateFeedbackStatus, getAlertActions, addAlertAction, formatTime
}

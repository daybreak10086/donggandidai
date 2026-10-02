const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const store = require('../miniprogram/utils/store')
const growth = require('../miniprogram/utils/growth-store')
const { addDays } = require('../miniprogram/utils/academic-rules')

const clone = value => JSON.parse(JSON.stringify(value))
let memory, navigation, toasts, modals

beforeEach(() => {
  memory = new Map()
  navigation = []
  toasts = []
  modals = []
  global.wx = {
    getStorageSync: key => memory.has(key) ? clone(memory.get(key)) : '',
    setStorageSync: (key, value) => memory.set(key, clone(value)),
    removeStorageSync: key => memory.delete(key),
    reLaunch: options => navigation.push(options.url),
    navigateTo: options => navigation.push(options.url),
    switchTab: options => navigation.push(options.url),
    showToast: options => toasts.push(options),
    showModal: options => modals.push(options),
    stopPullDownRefresh() {}
  }
  store.init()
})

function page(route, options = {}) {
  let definition
  global.Page = value => { definition = value }
  const filename = require.resolve('../miniprogram/' + route)
  delete require.cache[filename]
  require(filename)
  const instance = Object.assign({}, definition)
  instance.data = clone(definition.data || {})
  instance.setData = (patch, callback) => {
    for (const [name, value] of Object.entries(patch)) {
      const keys = name.replace(/\[(\d+)\]/g, '.$1').split('.')
      let target = instance.data
      for (let index = 0; index < keys.length - 1; index += 1) {
        const key = keys[index]
        if (!target[key]) target[key] = /^\d+$/.test(keys[index + 1]) ? [] : {}
        target = target[key]
      }
      target[keys.at(-1)] = clone(value)
    }
    if (callback) callback()
  }
  if (instance.onLoad) instance.onLoad(options)
  if (instance.onShow) instance.onShow()
  return instance
}

function input(value, dataset = {}) {
  return { detail: { value }, currentTarget: { dataset } }
}

function tap(dataset = {}) { return { currentTarget: { dataset } } }

function answerModal(confirm) {
  const modal = modals.at(-1)
  assert.ok(modal, '界面应请求确认')
  modal.success({ confirm, cancel: !confirm })
  return modal
}

function createPlanPage() {
  const instance = page('pages/plan/plan')
  instance.createPlan()
  assert.equal(instance.data.plans.length, 1)
  return instance
}

test('预警自助处理记录动作并打开计划草稿，确认之前不会创建正式计划', () => {
  store.setCurrentStudent('s005')
  const warning = page('pages/alert-detail/alert-detail')
  warning.onSelf()
  assert.equal(store.getAlertActions()[0].action, '自助处理')
  assert.equal(navigation.at(-1), '/pages/plan/plan?from=warning')
  assert.equal(growth.getPlans().length, 0)
  const plan = page('pages/plan/plan', { from: 'warning' })
  assert.equal(plan.data.draftVisible, true)
  assert.equal(plan.data.sourceWarningId, store.getAcademicWarning().id)
  assert.equal(plan.data.plans.length, 0)
  assert.equal(growth.getPlans().length, 0)
})

test('真实草稿编辑事件更新名称、任务和期限，已有同源计划时不再打开重复草稿', () => {
  store.setCurrentStudent('s005')
  const instance = page('pages/plan/plan')
  instance.onTitleInput(input('本周先解决一门课'))
  instance.onTaskTitleInput(input('联系老师确认作业要求', { index: 0 }))
  instance.onTaskDueChange(input(instance.data.today, { index: 0 }))
  instance.addDraftTask()
  assert.equal(instance.data.draftTasks.length, 4)
  instance.removeDraftTask(tap({ index: 3 }))
  instance.createPlan()
  const stored = growth.getPlans()[0]
  assert.equal(stored.title, '本周先解决一门课')
  assert.equal(stored.tasks[0].title, '联系老师确认作业要求')
  assert.equal(stored.tasks[0].dueDate, instance.data.today)
  assert.equal(instance.data.draftVisible, false)
  assert.equal(instance.data.saving, false)
  assert.equal(instance.data.plans[0].completionText, '0%')
  instance.openDraft()
  assert.equal(instance.data.draftVisible, false)
  assert.equal(growth.getPlans().length, 1)
  assert.equal(growth.getPlans()[0].id, stored.id)
  assert.ok(toasts.at(-1).title.includes('已有计划'))
})

test('无效草稿保留输入并结束保存状态，不创建半成品计划', () => {
  store.setCurrentStudent('s001')
  const instance = page('pages/plan/plan')
  instance.onTaskTitleInput(input(' ', { index: 0 }))
  instance.createPlan()
  assert.equal(instance.data.draftVisible, true)
  assert.equal(instance.data.saving, false)
  assert.equal(instance.data.draftTasks[0].title, ' ')
  assert.equal(growth.getPlans().length, 0)
  assert.equal(toasts.at(-1).icon, 'none')
})

test('任务完成、延期和取消走实际事件，更新进度并展示操作日志', () => {
  store.setCurrentStudent('s005')
  const instance = createPlanPage()
  const plan = instance.data.plans[0]
  instance.completeTask(tap({ plan: plan.id, task: plan.tasks[0].id }))
  assert.equal(instance.data.plans[0].tasks[0].status, 'completed')
  assert.equal(instance.data.plans[0].completionText, '33.3%')
  assert.equal(instance.data.plans[0].tasks[0].logs[0].label, '已完成')
  instance.openPostpone(tap({ plan: plan.id, task: plan.tasks[1].id }))
  const dueDate = addDays(plan.tasks[1].dueDate, 2)
  instance.onPostponeDateChange(input(dueDate))
  instance.savePostpone()
  assert.ok(instance.data.postpone, '没有延期原因时保留表单')
  instance.onPostponeReasonInput(input('答疑时间调整到周末'))
  instance.savePostpone()
  assert.equal(instance.data.postpone, null)
  const postponed = instance.data.plans[0].tasks[1]
  assert.equal(postponed.dueDate, dueDate)
  assert.equal(postponed.originalDueDate, plan.tasks[1].dueDate)
  assert.equal(postponed.logs[0].reason, '答疑时间调整到周末')
  instance.cancelTask(tap({ plan: plan.id, task: plan.tasks[2].id }))
  answerModal(false)
  assert.equal(growth.getPlans()[0].tasks[2].status, 'pending')
  instance.cancelTask(tap({ plan: plan.id, task: plan.tasks[2].id }))
  answerModal(true)
  assert.equal(instance.data.plans[0].tasks[2].status, 'canceled')
  assert.equal(instance.data.plans[0].completionText, '50%')
  assert.equal(instance.data.plans[0].tasks[2].logs[0].label, '已取消')
})

test('切换学生后 onShow 清空旧草稿、延期表单和已展示计划', () => {
  store.setCurrentStudent('s005')
  // 已有个人计划时仍可拟定首次学业提醒对应计划，形成真实可见的未保存草稿。
  growth.createPlan({ ...growth.getPlanSuggestion(), sourceWarningId: null })
  const instance = page('pages/plan/plan')
  instance.openDraft()
  assert.equal(instance.data.draftVisible, true)
  instance.onTitleInput(input('汪同学未保存草稿'))
  const oldPlan = instance.data.plans[0]
  instance.openPostpone(tap({ plan: oldPlan.id, task: oldPlan.tasks[0].id }))
  store.setCurrentStudent('s001')
  instance.onShow()
  assert.equal(instance.data.studentId, 's001')
  assert.equal(instance.data.plans.length, 0)
  assert.equal(instance.data.postpone, null)
  assert.equal(instance.data.sourceWarningId, null)
  assert.notEqual(instance.data.draftTitle, '汪同学未保存草稿')
})

test('记录输入事件保存零值、缺失和小数，并在表单及历史中显示当前版本', () => {
  store.setCurrentStudent('s005')
  const instance = page('pages/check-in/check-in')
  const previousRevision = instance.data.revision
  instance.onFieldInput(input('0', { field: 'learningMinutes' }))
  instance.onFieldInput(input('', { field: 'exerciseMinutes' }))
  instance.onFieldInput(input('7.25', { field: 'sleepHours' }))
  instance.onFieldInput(input('20', { field: 'pressureScore' }))
  assert.equal(instance.data.dirty, true)
  instance.saveRecord()
  const saved = growth.getDailyRecord(instance.data.selectedDate)
  assert.equal(saved.learningMinutes, 0)
  assert.equal(saved.exerciseMinutes, null)
  assert.equal(saved.sleepHours, 7.25)
  assert.equal(saved.pressureScore, 20)
  assert.equal(instance.data.form.learningMinutes, '0')
  assert.equal(instance.data.form.exerciseMinutes, '')
  assert.equal(instance.data.revision, previousRevision + 1)
  assert.equal(instance.data.dirty, false)
  assert.equal(instance.data.saving, false)
  assert.equal(instance.data.history.find(row => row.date === instance.data.selectedDate).learningText, '0 分钟')
})

test('记录校验失败不覆盖旧记录，输入和未保存提示保留以便修改', () => {
  store.setCurrentStudent('s001')
  const instance = page('pages/check-in/check-in')
  const previous = growth.getDailyRecord(instance.data.selectedDate)
  instance.onFieldInput(input('1441', { field: 'learningMinutes' }))
  instance.saveRecord()
  assert.deepEqual(growth.getDailyRecord(instance.data.selectedDate), previous)
  assert.equal(instance.data.form.learningMinutes, '1441')
  assert.equal(instance.data.dirty, true)
  assert.equal(instance.data.saving, false)
  assert.equal(toasts.at(-1).icon, 'none')
})

test('删除记录需要明确确认，取消保留；确认后表单、历史和底层记录同步清除', () => {
  store.setCurrentStudent('s005')
  const instance = page('pages/check-in/check-in')
  const date = instance.data.selectedDate
  const previous = growth.getDailyRecord(date)
  instance.deleteRecord()
  assert.ok(modals.at(-1).content.includes(date))
  assert.ok(modals.at(-1).content.includes('隐藏'))
  answerModal(false)
  assert.deepEqual(growth.getDailyRecord(date), previous)
  instance.deleteRecord()
  answerModal(true)
  assert.equal(instance.data.hasRecord, false)
  assert.equal(instance.data.form.learningMinutes, '')
  assert.equal(instance.data.history.some(row => row.date === date), false)
  assert.equal(growth.getDailyRecord(date), null)
})

test('未保存记录切换日期或离开时先确认，拒绝切换保留输入', () => {
  store.setCurrentStudent('s001')
  const instance = page('pages/check-in/check-in')
  const originalDate = instance.data.selectedDate
  instance.onFieldInput(input('135', { field: 'learningMinutes' }))
  instance.onDateChange(input(addDays(originalDate, -1)))
  answerModal(false)
  assert.equal(instance.data.selectedDate, originalDate)
  assert.equal(instance.data.form.learningMinutes, '135')
  instance.selectHistory(tap({ date: addDays(originalDate, -1) }))
  answerModal(true)
  assert.equal(instance.data.selectedDate, addDays(originalDate, -1))
  assert.equal(instance.data.dirty, false)
  instance.onFieldInput(input('142', { field: 'learningMinutes' }))
  instance.goReport()
  answerModal(false)
  assert.equal(navigation.length, 0)
  instance.goReport()
  answerModal(true)
  assert.equal(navigation.at(-1), '/pages/weekly-report/weekly-report')
})

test('隐私设置返回后清除旧表单值和来源，保存学习记录不会擦掉隐藏字段', () => {
  store.setCurrentStudent('s005')
  const today = growth.getContext().today
  growth.saveDailyRecord({ date: today, learningMinutes: 50, exerciseMinutes: 37, sleepHours: 8.5, pressureScore: 13 })
  const instance = page('pages/check-in/check-in')
  assert.equal(instance.data.form.pressureScore, '13')
  store.updateSettings({ showHealth: false, showMental: false })
  instance.onShow()
  assert.equal(instance.data.showHealth, false)
  assert.equal(instance.data.showMental, false)
  for (const field of ['exerciseMinutes', 'sleepHours', 'pressureScore']) {
    assert.equal(instance.data.form[field], '')
    assert.equal(Object.hasOwn(instance.data.sources, field), false)
    for (const record of instance.data.history) assert.equal(Object.hasOwn(record, field), false)
  }
  instance.onFieldInput(input('88', { field: 'learningMinutes' }))
  instance.saveRecord()
  store.updateSettings({ showHealth: true, showMental: true })
  instance.onShow()
  assert.equal(instance.data.form.learningMinutes, '88')
  assert.equal(instance.data.form.exerciseMinutes, '37')
  assert.equal(instance.data.form.sleepHours, '8.5')
  assert.equal(instance.data.form.pressureScore, '13')
})

test('记录页在切换学生后不保留上一学生的草稿、历史或记录值', () => {
  store.setCurrentStudent('s005')
  const instance = page('pages/check-in/check-in')
  instance.onFieldInput(input('1379', { field: 'learningMinutes' }))
  instance.saveRecord()
  instance.onFieldInput(input('1380', { field: 'learningMinutes' }))
  store.setCurrentStudent('s001')
  instance.onShow()
  assert.equal(instance.data.studentId, 's001')
  assert.notEqual(instance.data.form.learningMinutes, '1379')
  assert.notEqual(instance.data.form.learningMinutes, '1380')
  assert.equal(instance.data.dirty, false)
  assert.equal(instance.data.history.some(row => row.learningMinutes === 1379), false)
})

test('回到记录页保留同账号未保存输入，隐藏设置会清除相应草稿而不保存它', () => {
  store.setCurrentStudent('s005')
  const instance = page('pages/check-in/check-in')
  const original = growth.getDailyRecord(instance.data.selectedDate)
  instance.onFieldInput(input('1379', { field: 'learningMinutes' }))
  instance.onFieldInput(input('1391', { field: 'exerciseMinutes' }))
  instance.onFieldInput(input('19', { field: 'pressureScore' }))
  instance.onShow()
  assert.equal(instance.data.form.learningMinutes, '1379')
  assert.equal(instance.data.form.exerciseMinutes, '1391')
  assert.equal(instance.data.dirty, true)
  store.updateSettings({ showHealth: false, showMental: false })
  instance.onShow()
  assert.equal(instance.data.form.learningMinutes, '1379')
  assert.equal(instance.data.form.exerciseMinutes, '')
  assert.equal(instance.data.form.pressureScore, '')
  store.updateSettings({ showHealth: true, showMental: true })
  instance.onShow()
  assert.equal(instance.data.form.learningMinutes, '1379')
  assert.equal(instance.data.form.exerciseMinutes, String(original.exerciseMinutes))
  assert.equal(instance.data.form.pressureScore, String(original.pressureScore))
  assert.deepEqual(growth.getDailyRecord(instance.data.selectedDate), original)
})

test('删除确认绑定打开弹窗时的日期，之后选择其他日期不会删除另一条记录', () => {
  store.setCurrentStudent('s005')
  const instance = page('pages/check-in/check-in')
  const originalDate = instance.data.selectedDate
  const otherDate = addDays(originalDate, -1)
  const otherRecord = growth.getDailyRecord(otherDate)
  assert.ok(otherRecord)
  instance.deleteRecord()
  const pending = modals.at(-1)
  instance.loadDate(otherDate)
  pending.success({ confirm: true })
  assert.equal(growth.getDailyRecord(originalDate), null)
  assert.deepEqual(growth.getDailyRecord(otherDate), otherRecord)
})

test('切换账号或退出后，迟到的记录删除确认不能修改任何学生的数据', () => {
  store.setCurrentStudent('s005')
  const instance = page('pages/check-in/check-in')
  const date = instance.data.selectedDate
  const original = growth.getDailyRecord(date)
  instance.deleteRecord()
  const pending = modals.at(-1)
  store.setCurrentStudent('s001')
  instance.onShow()
  const other = growth.getDailyRecord(date)
  pending.success({ confirm: true })
  assert.deepEqual(growth.getDailyRecord(date), other)
  store.setCurrentStudent('s005')
  assert.deepEqual(growth.getDailyRecord(date), original)
  instance.onShow()
  instance.deleteRecord()
  const afterLogout = modals.at(-1)
  store.logout()
  assert.doesNotThrow(() => afterLogout.success({ confirm: true }))
  store.setCurrentStudent('s005')
  assert.deepEqual(growth.getDailyRecord(date), original)
})

test('切换学生后迟到的推进日期确认不会推进新学生的日期', () => {
  store.setCurrentStudent('s005')
  const checkIn = page('pages/check-in/check-in')
  checkIn.onFieldInput(input('137', { field: 'learningMinutes' }))
  checkIn.advanceDay()
  const discard = modals.at(-1)
  const plan = page('pages/plan/plan')
  plan.advanceDay()
  const advance = modals.at(-1)
  store.setCurrentStudent('s001')
  const date = growth.getContext().today
  discard.success({ confirm: true })
  advance.success({ confirm: true })
  assert.equal(growth.getContext().today, date)
  store.setCurrentStudent('s005')
  assert.equal(growth.getContext().today, date)
})

test('成长周报 onShow 更新记录和显示开关，公式详情可展开且不泄露隐藏维度', () => {
  store.setCurrentStudent('s005')
  const instance = page('pages/weekly-report/weekly-report')
  assert.equal(instance.data.report.status.key, 'improving')
  instance.toggleMethods()
  assert.equal(instance.data.methodsVisible, true)
  const date = growth.getContext().today
  growth.saveDailyRecord({ date, learningMinutes: 139 })
  instance.onShow()
  assert.equal(instance.data.report.studyBars.find(item => item.date === date).value, 139)
  store.updateSettings({ showHealth: false, showMental: false })
  instance.onShow()
  assert.equal(instance.data.report.wellbeing.length, 0)
  const methodsAndAdvice = JSON.stringify([instance.data.report.methods, instance.data.report.advice])
  assert.equal(/睡眠|压力|运动/.test(methodsAndAdvice), false)
  instance.toggleMethods()
  assert.equal(instance.data.methodsVisible, false)
})

test('三个成长页推进的是同一模拟日期，记录页先确认未保存修改', () => {
  store.setCurrentStudent('s005')
  const checkIn = page('pages/check-in/check-in')
  const report = page('pages/weekly-report/weekly-report')
  const plan = page('pages/plan/plan')
  const initialDate = checkIn.data.today
  checkIn.onFieldInput(input('137', { field: 'learningMinutes' }))
  checkIn.advanceDay()
  answerModal(false)
  assert.equal(growth.getContext().today, initialDate)
  checkIn.advanceDay()
  answerModal(true)
  assert.equal(checkIn.data.today, addDays(initialDate, 1))
  assert.equal(checkIn.data.selectedDate, checkIn.data.today)
  assert.equal(checkIn.data.form.learningMinutes, '')
  report.onShow()
  assert.equal(report.data.today, checkIn.data.today)
  assert.equal(report.data.report.period.to, checkIn.data.today)
  report.advanceDay()
  plan.onShow()
  assert.equal(plan.data.today, addDays(initialDate, 2))
  plan.advanceDay()
  answerModal(true)
  assert.equal(growth.getContext().today, addDays(initialDate, 3))
  checkIn.onShow()
  assert.equal(checkIn.data.today, addDays(initialDate, 3))
})

test('页面快捷跳转指向注册页面，未登录及退出后的事件均被登录守卫拦截', () => {
  const app = require('../miniprogram/app.json')
  const routes = ['pages/plan/plan', 'pages/check-in/check-in', 'pages/weekly-report/weekly-report']
  for (const route of routes) {
    assert.ok(app.pages.includes(route))
    page(route)
  }
  assert.ok(navigation.length >= 3)
  assert.equal(navigation.every(url => url === '/pages/login/login'), true)
  store.setCurrentStudent('s005')
  const plan = page(routes[0]); const checkIn = page(routes[1]); const report = page(routes[2])
  navigation.length = 0
  plan.goCheckIn(); plan.goReport(); checkIn.goPlan(); report.goPlan(); report.goCheckIn()
  for (const url of navigation) assert.ok(app.pages.includes(url.slice(1)))
  store.logout()
  navigation.length = 0
  plan.createPlan(); checkIn.saveRecord(); checkIn.goReport(); report.advanceDay()
  assert.ok(navigation.length >= 4)
  assert.equal(navigation.every(url => url === '/pages/login/login'), true)
})

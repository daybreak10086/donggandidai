const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const store = require('../miniprogram/utils/store')
const rules = require('../miniprogram/utils/academic-rules')
const mock = require('../miniprogram/utils/mock')
let memory, navigation, savedFiles
const clone = value => JSON.parse(JSON.stringify(value))

beforeEach(() => {
  memory = new Map(); navigation = []; savedFiles = new Set()
  global.wx = {
    getStorageSync: key => memory.has(key) ? clone(memory.get(key)) : '',
    setStorageSync: (key, value) => memory.set(key, clone(value)),
    removeStorageSync: key => memory.delete(key),
    reLaunch: o => navigation.push(o.url),
    switchTab: o => { navigation.push(o.url); if (o.complete) o.complete() },
    navigateTo: o => navigation.push(o.url),
    showToast() {}, stopPullDownRefresh() {},
    showModal: o => o.success({ confirm: true }),
    getFileSystemManager: () => ({
      saveFile: o => { const savedFilePath = 'wxfile://saved/' + path.basename(o.tempFilePath); savedFiles.add(savedFilePath); o.success({ savedFilePath }) },
      removeSavedFile: o => savedFiles.delete(o.filePath)
    })
  }
  store.init()
})

function page(route) {
  let options
  global.Page = value => { options = value }
  const file = require.resolve('../miniprogram/' + route)
  delete require.cache[file]
  require(file)
  const instance = Object.assign({}, options)
  instance.data = clone(options.data || {})
  instance.setData = patch => Object.assign(instance.data, patch)
  return instance
}

test('未登录、旧版自动账号及退出后均不会回退到黄同学', () => {
  wx.setStorageSync('wr_current_student', 's001')
  store.init()
  assert.equal(store.getCurrentStudentId(), null)
  assert.equal(store.requireSession(), false)
  assert.equal(navigation.at(-1), '/pages/login/login')
  assert.throws(() => store.getStudent(), /登录/)
  store.setCurrentStudent('s005'); store.logout()
  assert.equal(store.getCurrentStudentId(), null)
})

test('六名学生可登录；无效账号、无效学生 ID 被拒绝', () => {
  mock.students.forEach(s => assert.equal(store.login(s.account, s.password), s.id))
  assert.equal(store.login('20230001', 'wrong'), null)
  assert.throws(() => store.setCurrentStudent('not-a-student'))
})

test('设置按学生隔离，重启后保留；旧版全局设置不会污染新账号', () => {
  wx.setStorageSync('wr_settings', { showHealth: false })
  store.setCurrentStudent('s002')
  store.updateSettings({ showHealth: false, enableHealthAlert: false })
  store.setCurrentStudent('s001')
  assert.equal(store.getSettings().showHealth, true)
  assert.equal(store.getSettings().enableHealthAlert, true)
  store.init(); store.setCurrentStudent('s002')
  assert.equal(store.getSettings().showHealth, false)
})

test('反馈仅展示当前学生；兼容旧记录，提交不能伪造所属学生', () => {
  store.setCurrentStudent('s002')
  const fb = store.addFeedback({ studentId: 's001', type: '错误数据', dimension: '身体健康', reason: '运动次数有误' })
  assert.equal(fb.studentId, 's002')
  store.setCurrentStudent('s001')
  assert.equal(store.getFeedbacks().length, 0)
  store.updateFeedbackStatus(fb.id, '已处理')
  store.setCurrentStudent('s002')
  assert.equal(store.getFeedbacks()[0].status, '待处理')
  assert.throws(() => store.addFeedback({ type: '错误数据', dimension: '身体健康', reason: ' ' }))
})

test('反馈 ID 不因同毫秒提交而覆盖，合法状态更新可保存', () => {
  store.setCurrentStudent('s001')
  const item = { type: '缺失数据', dimension: '学习状态', reason: '缺少一次作业' }
  const a = store.addFeedback(item); const b = store.addFeedback(item)
  assert.notEqual(a.id, b.id)
  store.updateFeedbackStatus(a.id, '已处理')
  assert.equal(store.getFeedbacks().find(f => f.id === a.id).status, '已处理')
})

test('关闭健康预警同时屏蔽列表、首页徽标和新消息入队', () => {
  store.setCurrentStudent('s002')
  store.updateSettings({ enableHealthAlert: false })
  assert.equal(store.getMessages().some(n => n.type === 'health' || n.topic === 'health'), false)
  assert.equal(store.enqueueNotification('s002', { id: 'new-health', type: 'health' }), false)
  const home = page('pages/index/index'); home.onShow()
  assert.equal(home.data.healthLabel, '预警已关闭')
  assert.equal(home.data.healthVisible, true)
  store.updateSettings({ showHealth: false }); home.onShow()
  assert.equal(home.data.healthVisible, false)
  store.updateSettings({ enableHealthAlert: true })
  assert.equal(store.getMessages().some(n => n.id === 'new-health'), false)
  assert.equal(store.getMessages().some(n => n.type === 'health'), true)
})

test('关闭心理显示会隐藏首页和详情，关闭情绪功能会隐藏消息详情', () => {
  store.setCurrentStudent('s003')
  store.updateSettings({ showMental: false, enableEmotionAlert: false })
  const home = page('pages/index/index'); home.onShow()
  const profile = page('pages/profile/profile'); profile.onShow()
  const detail = page('pages/message-detail/message-detail'); detail.onLoad({ id: 'n_w001' }); detail.onShow()
  assert.equal(home.data.mentalVisible, false)
  assert.equal(profile.data.dimensions.some(d => d.key === 'mental'), false)
  assert.equal(detail.data.message, null)
  assert.equal(store.getMessages().some(n => n.type === 'emotion'), false)
})

test('通知按优先级排序、入队去重，已读状态在账号间隔离', () => {
  store.setCurrentStudent('s005')
  const first = store.getMessages()[0]
  assert.equal(first.type, 'academic')
  store.markMessageRead(first.id)
  assert.equal(store.enqueueNotification('s005', first), false)
  assert.equal(store.getMessages().find(n => n.id === first.id).read, true)
  store.setCurrentStudent('s003')
  assert.equal(store.getMessages().some(n => n.read), false)
})

test('默认历史明显改善，先有学生事件；7 天后停滞产生一次升级事件', () => {
  store.setCurrentStudent('s005')
  assert.equal(store.getAcademicEscalation(), false)
  assert.equal(store.getAcademicEvents()[0].recipient, 'student')
  assert.equal(store.getCounselorEvents().length, 0)
  store.advanceAcademicDemo(false)
  assert.equal(store.getAcademicStatus().dropPercent, '4.6')
  assert.equal(store.getAcademicEscalation(), true)
  store.evaluateAcademic(); store.evaluateAcademic()
  assert.equal(store.getCounselorEvents().length, 1)
  assert.equal(store.getCounselorEvents()[0].status, '待接入辅导员服务')
})

test('重播首次提醒后必须经过完整 21 天；忽略不会停止观察', () => {
  store.setCurrentStudent('s005'); store.resetAcademicDemo()
  assert.equal(store.getAcademicStatus().remainingDays, 21)
  store.addAlertAction(null, '忽略', '暂不处理')
  store.advanceAcademicDemo(false); store.advanceAcademicDemo(false)
  assert.equal(store.getCounselorEvents().length, 0)
  assert.equal(store.getAcademicStatus().remainingDays, 7)
  store.advanceAcademicDemo(false)
  assert.equal(store.getCounselorEvents().length, 1)
})

test('预警下降不会自动升级；主动求助立即入队且不重复', () => {
  store.setCurrentStudent('s005'); store.resetAcademicDemo()
  store.advanceAcademicDemo(true); store.advanceAcademicDemo(true); store.advanceAcademicDemo(true)
  assert.equal(store.getCounselorEvents().length, 0)
  store.addAlertAction(null, '请求辅导员帮助', '请求帮助')
  store.addAlertAction(null, '请求辅导员帮助', '再次选择')
  store.addAlertAction(null, '自助处理', '自主处理')
  assert.equal(store.getCounselorEvents().length, 1)
  assert.equal(store.getAlertActions().length, 3)
  store.setCurrentStudent('s001')
  assert.equal(store.getCounselorEvents().length, 0)
  assert.equal(store.getAlertActions().length, 0)
})

test('降幅恰好 5% 不升级；不足 5% 才升级', () => {
  const w = { level: 'low', firstNotifiedAt: '2026-06-01', history: [{ date: '2026-06-01', value: 100 }, { date: '2026-06-22', value: 95 }] }
  assert.equal(rules.evaluate(w, '2026-06-22').escalate, false)
  w.history[1].value = 96
  assert.equal(rules.evaluate(w, '2026-06-22').escalate, true)
})

test('未来数据、陈旧样本、非法日期不会导致误升级', () => {
  const w = { level: 'low', firstNotifiedAt: '2026-06-01', history: [{ date: '2026-06-01', value: 80 }, { date: '2026-06-15', value: 80 }, { date: '2026-07-01', value: 90 }] }
  assert.equal(rules.evaluate(w, '2026-06-15').escalate, false)
  assert.equal(rules.evaluate(w, '2026-06-30').eligible, false)
  assert.equal(rules.evaluate(w, '2026-02-30').eligible, false)
  assert.equal(rules.evaluate({ level: 'none' }, '2026-06-22').escalate, false)
})

test('预警详情可完整操作并展示事件，处理记录可持久化', () => {
  store.setCurrentStudent('s005')
  const detail = page('pages/alert-detail/alert-detail'); detail.onShow()
  assert.equal(detail.data.hasWarning, true)
  detail.onSelf(); detail.onHelp(); detail.onIgnore()
  assert.equal(detail.data.actions.length, 3)
  assert.equal(detail.data.events.length, 2)
  detail.onReplay()
  assert.equal(detail.data.actions.length, 0)
  assert.equal(detail.data.status.remainingDays, 21)
})

test('六名学生的首页与各业务页面可用模拟 API 初始化', () => {
  const app = require('../miniprogram/app.json')
  for (const student of mock.students) {
    store.setCurrentStudent(student.id)
    for (const route of app.pages.filter(p => p !== 'pages/login/login')) {
      const instance = page(route)
      if (instance.onLoad) instance.onLoad({})
      if (instance.onShow) instance.onShow()
    }
  }
})

test('业务页面直接进入或退出后触发旧页面事件，都会被登录守卫拦截', () => {
  const home = page('pages/index/index')
  home.onShow(); home.goAlert()
  assert.equal(navigation.every(url => url === '/pages/login/login'), true)
  assert.deepEqual(home.data.student, {})
})

test('头像保存持久路径、替换后清理旧文件；昵称按学生隔离', async () => {
  store.setCurrentStudent('s001')
  const first = await store.saveAvatar('/tmp/first.png')
  assert.equal(store.getProfile().avatarUrl, first)
  await store.saveAvatar('/tmp/second.png')
  assert.equal(savedFiles.has(first), false)
  assert.equal(savedFiles.size, 1)
  store.updateProfile(null, { nickname: '新昵称' })
  store.setCurrentStudent('s002')
  assert.equal(store.getProfile().nickname, '阿池')
})

test('头像保存失败保留旧头像，异步完成仍写入发起学生', async () => {
  store.setCurrentStudent('s001')
  await store.saveAvatar('/tmp/original.png')
  const before = store.getProfile().avatarUrl
  wx.getFileSystemManager = () => ({ saveFile: o => o.fail(new Error('disk full')) })
  await assert.rejects(store.saveAvatar('/tmp/fail.png'))
  assert.equal(store.getProfile().avatarUrl, before)
  let callback
  wx.getFileSystemManager = () => ({ saveFile: o => { callback = o.success }, removeSavedFile() {} })
  const task = store.saveAvatar('/tmp/later.png')
  store.setCurrentStudent('s002')
  callback({ savedFilePath: 'wxfile://saved/later.png' }); await task
  assert.equal(store.getProfile('s001').avatarUrl, 'wxfile://saved/later.png')
  assert.equal(store.getProfile('s002').avatarUrl, '')
})

test('账号修改拒绝重名及短密码；保存后要求重新登录', () => {
  store.setCurrentStudent('s001')
  assert.throws(() => store.updateAccountInfo(null, { account: '20230002', password: 'abcdef' }))
  assert.throws(() => store.updateAccountInfo(null, { account: 'new', password: '123' }))
  const account = page('pages/settings/account/account'); account.onShow()
  account.setData({ newAccount: 'new-student-1', newPassword: 'abcdef' }); account.onSave()
  assert.equal(store.getCurrentStudentId(), null)
  assert.equal(store.login('20230001', '123456'), null)
  assert.equal(store.login('new-student-1', 'abcdef'), 's001')
})

test('微信接口失败不冒充登录成功，本地演示可继续；微信体验不存 code', () => {
  const login = page('pages/login/login'); login.onLoad()
  wx.login = o => o.fail({ errMsg: 'unavailable' })
  login.onWechatLogin()
  assert.equal(store.getCurrentStudentId(), null)
  assert.equal(login.data.loggingIn, false)
  login.onDemoLogin()
  assert.equal(store.getCurrentStudentId(), 's001')
  store.logout()
  wx.login = o => o.success({ code: 'single-use-secret-code' })
  login.onWechatLogin()
  assert.equal(store.getCurrentStudentId(), 's001')
  assert.equal(JSON.stringify([...memory]).includes('single-use-secret-code'), false)
})

test('Mock 双份同步，门禁字段一致，消息 ID 唯一，历史数值和当前值一致', () => {
  const exported = require('../mock/students.json')
  assert.deepEqual(exported.students, mock.students)
  assert.deepEqual(exported.FIELD_META, mock.FIELD_META)
  const ids = []
  for (const s of mock.students) {
    assert.equal(s.health.dormInOutTimes, s.mental.dormInOutTimes)
    ids.push(...s.notifications.map(n => n.id))
    if (s.warnings.academic.history) assert.equal(s.warnings.academic.value, s.warnings.academic.history.at(-1).value)
  }
  assert.equal(new Set(ids).size, ids.length)
})

test('页面四件套、JS/JSON 语法、事件处理器和跳转路由完整', () => {
  const base = path.resolve(__dirname, '../miniprogram')
  const app = require('../miniprogram/app.json')
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (file.endsWith('.js')) new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file })
      else if (file.endsWith('.json')) JSON.parse(fs.readFileSync(file, 'utf8'))
    }
  }
  visit(base)
  for (const route of app.pages) {
    for (const ext of ['.js', '.json', '.wxml', '.wxss']) assert.ok(fs.existsSync(path.join(base, route + ext)), route + ext)
    const instance = page(route)
    const wxml = fs.readFileSync(path.join(base, route + '.wxml'), 'utf8')
    for (const m of wxml.matchAll(/(?:bind:?[\w]+|catch:?[\w]+)="([a-zA-Z]\w*)"/g)) assert.equal(typeof instance[m[1]], 'function', route + ':' + m[1])
    const source = fs.readFileSync(path.join(base, route + '.js'), 'utf8')
    for (const m of source.matchAll(/url:\s*['"]\/([^'"?]+)(?:\?[^'"]*)?['"]/g)) assert.ok(app.pages.includes(m[1]), route + ':' + m[1])
  }
})

test('根目录和子目录导入使用相同 AppID 与基础库版本', () => {
  const root = require('../../project.config.json')
  const nested = require('../miniprogram/project.config.json')
  assert.equal(root.appid, nested.appid)
  assert.equal(root.libVersion, nested.libVersion)
  // 开发者工具本机配置不提交 Git；存在时仍检查它不会覆盖为另一基础库版本。
  for (const relative of ['../../project.private.config.json', '../miniprogram/project.private.config.json']) {
    const file = path.resolve(__dirname, relative)
    if (fs.existsSync(file)) assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).libVersion, root.libVersion)
  }
})

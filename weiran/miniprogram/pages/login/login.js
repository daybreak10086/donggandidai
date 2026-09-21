const store = require('../../utils/store')

Page({
  data: { account: '', password: '', loggingIn: false, students: [], studentIndex: 0 },
  onLoad: function () {
    this.setData({ students: store.getStudents().map(s => ({ id: s.id, name: s.name, account: store.getAccountInfo(s.id).account })) })
  },
  onShow: function () {
    this.setData({ loggingIn: false })
    if (store.getCurrentStudentId()) wx.switchTab({ url: '/pages/index/index' })
  },
  onStudentChange: function (e) { this.setData({ studentIndex: Number(e.detail.value) }) },
  onAccountInput: function (e) { this.setData({ account: e.detail.value }) },
  onPasswordInput: function (e) { this.setData({ password: e.detail.value }) },
  enter: function (sid, mode) {
    store.setCurrentStudent(sid, mode)
    wx.switchTab({
      url: '/pages/index/index',
      fail: () => wx.showToast({ title: '页面打开失败，请重试', icon: 'none' }),
      complete: () => this.setData({ loggingIn: false })
    })
  },
  onDemoLogin: function () {
    if (this.data.loggingIn) return
    this.setData({ loggingIn: true })
    this.enter(this.data.students[this.data.studentIndex].id, 'local-mock')
  },
  onWechatLogin: function () {
    if (this.data.loggingIn) return
    const sid = this.data.students[this.data.studentIndex].id
    this.setData({ loggingIn: true })
    wx.login({
      timeout: 10000,
      success: res => {
        if (!res.code) {
          this.setData({ loggingIn: false })
          wx.showToast({ title: '未获取微信凭证，可用本地演示', icon: 'none' })
          return
        }
        // MVP 仅验证微信登录接口可调用，再映射到所选模拟学生。
        // 真实环境须将一次性 code 交由后端换取会话并绑定学籍；前端不保存 code/secret。
        this.enter(sid, 'wechat-mock')
      },
      fail: () => {
        this.setData({ loggingIn: false })
        wx.showToast({ title: '微信登录不可用，请使用本地演示', icon: 'none', duration: 2500 })
      }
    })
  },
  onLogin: function () {
    if (this.data.loggingIn) return
    const account = this.data.account.trim()
    const password = this.data.password
    if (!account || !password) { wx.showToast({ title: '请输入账号和密码', icon: 'none' }); return }
    this.setData({ loggingIn: true })
    const sid = store.login(account, password)
    if (sid) this.enter(sid, 'account-mock')
    else {
      this.setData({ loggingIn: false })
      wx.showToast({ title: '账号或密码错误', icon: 'none' })
    }
  }
})

const definePage = require('../../../utils/page')
const store = require('../../../utils/store')

definePage({
  data: {
    accountInfo: {},
    newAccount: '',
    newPassword: ''
  },
  onShow: function () { this.refresh() },
  refresh: function () {
    const info = store.getAccountInfo()
    this.setData({ accountInfo: info, newAccount: info.account, newPassword: '' })
  },
  onNewAccountInput: function (e) { this.setData({ newAccount: e.detail.value }) },
  onNewPasswordInput: function (e) { this.setData({ newPassword: e.detail.value }) },
  onSave: function () {
    const account = this.data.newAccount.trim()
    const password = this.data.newPassword
    if (!account) { wx.showToast({ title: '账号不能为空', icon: 'none' }); return }
    if (!password) { wx.showToast({ title: '密码不能为空', icon: 'none' }); return }
    try { store.updateAccountInfo(null, { account: account, password: password }) }
    catch (error) { wx.showToast({ title: error.message, icon: 'none' }); return }
    store.logout()
    wx.reLaunch({ url: '/pages/login/login' })
    wx.showToast({ title: '已更新，请重新登录', icon: 'none' })
  }
})

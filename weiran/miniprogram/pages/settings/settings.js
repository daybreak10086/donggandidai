const definePage = require('../../utils/page')
const store = require('../../utils/store')

definePage({
  data: {
    categories: [
      { key: 'info', title: '头像与昵称', desc: '更换头像、设置昵称' },
      { key: 'account', title: '账号与安全', desc: '修改登录账号与密码' },
      { key: 'display', title: '预警值显示', desc: '控制首页画像卡片是否显示健康 / 心理健康模块' },
      { key: 'push', title: '预警推送', desc: '控制健康预警、情绪预警的展示与推送' }
    ]
  },
  goCategory: function (e) {
    const key = e.currentTarget.dataset.key
    const map = {
      info: '/pages/settings/info/info',
      account: '/pages/settings/account/account',
      display: '/pages/settings/display/display',
      push: '/pages/settings/push/push'
    }
    if (map[key]) wx.navigateTo({ url: map[key] })
  },
  onLogout: function () {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: function (res) {
        if (res.confirm) {
          store.logout()
          wx.reLaunch({ url: '/pages/login/login' })
        }
      }
    })
  }
})

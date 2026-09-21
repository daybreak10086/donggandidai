const definePage = require('../../../utils/page')
const store = require('../../../utils/store')

definePage({
  data: { student: {}, nickname: '', avatarUrl: '', savingAvatar: false },
  onShow: function () { this.refresh() },
  refresh: function () {
    const student = store.getStudentView()
    this.setData({ student: student, nickname: student.nickname, avatarUrl: student.avatarUrl })
  },
  onChooseAvatar: function (e) {
    if (this.data.savingAvatar || !e.detail.avatarUrl) return
    const sid = store.getCurrentStudentId()
    this.setData({ savingAvatar: true })
    store.saveAvatar(e.detail.avatarUrl, sid).then(avatarUrl => {
      if (store.getCurrentStudentId() !== sid) return
      this.setData({ avatarUrl: avatarUrl })
      wx.showToast({ title: '头像已保存', icon: 'success' })
    }).catch(() => {
      wx.showToast({ title: '头像保存失败，请重试', icon: 'none' })
    }).then(() => this.setData({ savingAvatar: false }))
  },
  onNicknameInput: function (e) { this.setData({ nickname: e.detail.value }) },
  onSaveNickname: function () {
    const nickname = this.data.nickname.trim()
    if (!nickname) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' })
      return
    }
    try { store.updateProfile(null, { nickname: nickname }) }
    catch (error) { wx.showToast({ title: error.message, icon: 'none' }); return }
    this.setData({ student: Object.assign({}, this.data.student, { nickname: nickname }) })
    wx.showToast({ title: '昵称已保存', icon: 'success' })
  }
})

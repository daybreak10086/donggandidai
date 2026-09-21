(function () {
  var routes = [
    { key: 'overview', title: '总览', hint: '展示预警分布、重点关注学生等概览数据。' },
    { key: 'students', title: '学生列表', hint: '展示学生列表与筛选。' },
    { key: 'student-detail', title: '学生详情', hint: '展示单个学生画像与预警详情。' },
    { key: 'academic-alert', title: '学业预警管理', hint: '管理学业预警与学生处理记录。' },
    { key: 'feedback', title: '数据反馈管理', hint: '处理学生提交的错误 / 缺失数据反馈。' }
  ]

  var current = 'overview'

  function renderNav() {
    var nav = document.getElementById('nav')
    nav.innerHTML = routes.map(function (r) {
      return '<a href="javascript:;" class="nav-item' + (r.key === current ? ' active' : '') + '" data-key="' + r.key + '">' + r.title + '</a>'
    }).join('')

    var items = nav.querySelectorAll('.nav-item')
    items.forEach(function (el) {
      el.addEventListener('click', function () {
        select(el.getAttribute('data-key'))
      })
    })
  }

  function select(key) {
    current = key
    var route = routes.find(function (r) { return r.key === key })
    document.getElementById('page-title').textContent = route.title
    document.getElementById('content').innerHTML =
      '<div class="placeholder-card">' +
        '<div class="placeholder-title">' + route.title + '</div>' +
        '<div class="placeholder-hint">' + route.hint + '</div>' +
        '<div class="placeholder-empty">页面框架已就绪，业务内容待开发</div>' +
      '</div>'
    renderNav()
  }

  function login() {
    document.getElementById('login-view').setAttribute('hidden', '')
    document.getElementById('shell-view').removeAttribute('hidden')
    select('overview')
  }

  function logout() {
    document.getElementById('shell-view').setAttribute('hidden', '')
    document.getElementById('login-view').removeAttribute('hidden')
  }

  window.App = { login: login, logout: logout }
})()

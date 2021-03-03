// ==UserScript==
// @name:zh-CN   Skillshare 字幕下载 v6
// @name         Skillshare Subtitle Downloader v6
// @namespace    https://greasyfork.org/users/5711
// @version      6
// @description:zh-CN  下载 Skillshare 的字幕文件 (.srt 文件)
// @description  Download Skillshare Subtitle as .srt file
// @author       Zheng Cheng
// @match        https://www.skillshare.com/classes/*
// @run-at       document-end
// @grant        unsafeWindow
// ==/UserScript==

// 写于 2020-2-24
// [工作原理]
// 1. 下载一门课程全部字幕（多个 .srt 文件）原理是利用 transcriptCuesArray，字幕数据都在里面，进行格式转换+保存即可
// 2. 下载当前视频的字幕（一个 .srt 文件）原理是用 videojs 里 textTracks 的 cue，进行格式转换+保存即可

(function () {
  'use strict';

  // 初始化一些必须的变量
  var sessions = null;
  var transcriptCuesArray = null;
  var div = document.createElement('div');
  var button = document.createElement('button'); // 下载全部字幕的按钮
  var button2 = document.createElement('button'); // 下载当前视频字幕的按钮
  var title_element = document.querySelector("div.class-details-header-title");

  function insertAfter(newNode, referenceNode) {
    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
  }

  // 注入
  async function inject_our_script() {
    transcriptCuesArray = await get_transcriptCuesArray();
    var subtitle_ids = Object.keys(transcriptCuesArray); // ['3150718', '3150719', '3150720', ...]
    var subtitle_count = subtitle_ids.length

    // 此按钮点击后：下载这门课的所有字幕 (得到多个文件)
    var button_text = `下载这门课的所有字幕 (${subtitle_count} 个 .srt 文件)`;
    button.textContent = button_text;
    button.addEventListener('click', download_subtitles);

    // 此按钮点击后：下载当前视频的一个字幕 (得到一个文件)
    button2.textContent = get_download_current_episode_button_text()
    button2.addEventListener('click', download_current_episode_subtitles);

    var button_css = `
      font-size: 16px;
      padding: 4px 18px;
    `;

    var button2_css = `
      font-size: 16px;
      padding: 4px 18px;
      margin-left: 10px;
    `;

    var div_css = `
      margin-bottom: 10px;
    `;

    button.setAttribute('style', button_css);
    button2.setAttribute('style', button2_css);
    div.setAttribute('style', div_css);

    div.appendChild(button);
    div.appendChild(button2);

    insertAfter(div, title_element);
  }

  // 把 cue 遍历一下，得到一个特定格式的对象数组
  function get_current_episode_content_array() {
    var vjs = videojs(document.querySelector('video'))
    var cues = vjs.textTracks()[0].cues
    var array = []
    for (var i = 0; i < cues.length; i++) {
      var cue = cues[i]
      var obj = {
        start: cue.startTime,
        end: cue.endTime,
        text: cue.text,
      }
      array.push(obj);
    }
    return array;
  }

  // 下载当前集字幕
  async function download_current_episode_subtitles() {
    var array = get_current_episode_content_array()
    var srt = parse_content_array_to_SRT(array);
    var filename = `${get_filename()}.srt`
    downloadString(srt, "text/plain", filename);
  }

  // CSRF
  function csrf() {
    return SS.serverBootstrap.parentClassData.formData.csrfTokenValue
  }

  // 拿到当前课程的 URL (不带任何参数或者 section，不带 /projects 或 /transcripts 在 URL 最后)
  function course_url() {
    var url1 = SS.serverBootstrap.loginPopupRedirectTo
    var url2 = window.location.origin + window.location.pathname
    if (url1) {
      return url1
    } else {
      return url2
    }
    // return document.querySelector('meta[property="og:url"]').content // 这个不可靠
    // 比如: 
    // https://www.skillshare.com/classes/Logo-Design-Mastery-The-Full-Course/1793713747
  }

  // 返回一个 URL
  function json_url() {
    return `${course_url()}/transcripts?format=json`
    // https://www.skillshare.com/classes/Logo-Design-Mastery-The-Full-Course/1793713747/transcripts?format=json
  }

  // 发 http 请求，拿到 transcriptCuesArray
  // 调用例子：var result = await get_transcriptCuesArray();
  async function get_transcriptCuesArray() {
    return new Promise(function (resolve, reject) {
      var url = json_url()
      fetch(url, {
          headers: {
            'x-csrftoken': csrf(),
            'accept': 'application/json, text/javascript, */*; q=0.01'
          }
        })
        .then(response => response.json())
        .then(data => {
          resolve(data.transcriptCuesArray)
        }).catch(e => {
          reject(e);
        })
    })
  }

  // 输入: id
  // 输出: sessions 数组里的一个对象
  function id_to_obj(id) {
    var array = sessions
    for (var i = 0; i < array.length; i++) {
      var one = array[i];
      if (one.id == id) {
        return one
      }
    }
    return null
  }

  // 输入: id
  // 输出: 文件名 (xxx.srt)
  function get_filename_by_id(id) {
    var obj = id_to_obj(id);
    var rank = obj.displayRank;
    var title = obj.title
    var filename = `${rank}.${safe_filename(title)}.srt`
    return filename
  }

  // 下载所有集的字幕
  async function download_subtitles() {
    sessions = unsafeWindow.SS.serverBootstrap.pageData.unitsData.units[0].sessions

    for (let key in transcriptCuesArray) {
      var value = transcriptCuesArray[key];
      var srt = parse_content_array_to_SRT(value.content);
      var filename = get_filename_by_id(key)
      downloadString(srt, "text/plain", filename);

      await sleep(1000);
      // 如果不 sleep，下载大概11个文件就会停下来（不会报错，但就是停下来了）
      // sleep 可以把全部42个文件下载下来
    }
  }

  // 把指定格式的数组
  // 转成 SRT
  // 返回字符串
  // var content_array_example = [
  //   {
  //     start: 0,
  //     end: 8.3,
  //     text: "hi"
  //   },
  //   // ...
  // ];
  function parse_content_array_to_SRT(content_array) {
    if (content_array === '') {
      return false;
    }

    var result = '';
    var BOM = '\uFEFF';
    result = BOM + result; // store final SRT result

    for (var i = 0; i < content_array.length; i++) {
      var one = content_array[i];
      var index = i + 1;
      var content = one.text
      var start = one.start
      var end = one.end

      // we want SRT format:
      /*
          1
          00:00:01,939 --> 00:00:04,350
          everybody Craig Adams here I'm a
          2
          00:00:04,350 --> 00:00:06,720
          filmmaker on YouTube who's digging
      */
      var new_line = "\n";
      result = result + index + new_line;
      // 1

      var start_time = process_time(parseFloat(start));
      var end_time = process_time(parseFloat(end));
      result = result + start_time;
      result = result + ' --> ';
      result = result + end_time + new_line;
      // 00:00:01,939 --> 00:00:04,350

      result = result + content + new_line + new_line;
    }
    return result;
  }


  // 处理时间. 比如 start="671.33"  start="37.64"  start="12" start="23.029"
  // 处理成 srt 时间, 比如 00:00:00,090    00:00:08,460    00:10:29,350
  function process_time(s) {
    s = s.toFixed(3);
    // 超棒的函数, 不论是整数还是小数都给弄成3位小数形式
    // 举个柚子:
    // 671.33 -> 671.330
    // 671 -> 671.000
    // 注意函数会四舍五入. 具体读文档

    var array = s.split('.');
    // 把开始时间根据句号分割
    // 671.330 会分割成数组: [671, 330]

    var Hour = 0;
    var Minute = 0;
    var Second = array[0]; // 671
    var MilliSecond = array[1]; // 330
    // 先声明下变量, 待会把这几个拼好就行了

    // 我们来处理秒数.  把"分钟"和"小时"除出来
    if (Second >= 60) {
      Minute = Math.floor(Second / 60);
      Second = Second - Minute * 60;
      // 把 秒 拆成 分钟和秒, 比如121秒, 拆成2分钟1秒

      Hour = Math.floor(Minute / 60);
      Minute = Minute - Hour * 60;
      // 把 分钟 拆成 小时和分钟, 比如700分钟, 拆成11小时40分钟
    }
    // 分钟，如果位数不够两位就变成两位，下面两个if语句的作用也是一样。
    if (Minute < 10) {
      Minute = '0' + Minute;
    }
    // 小时
    if (Hour < 10) {
      Hour = '0' + Hour;
    }
    // 秒
    if (Second < 10) {
      Second = '0' + Second;
    }
    return Hour + ':' + Minute + ':' + Second + ',' + MilliSecond;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // copy from: https://gist.github.com/danallison/3ec9d5314788b337b682
  // Example downloadString(srt, "text/plain", filename);
  function downloadString(text, fileType, fileName) {
    var blob = new Blob([text], {
      type: fileType
    });
    var a = document.createElement('a');
    a.download = fileName;
    a.href = URL.createObjectURL(blob);
    a.dataset.downloadurl = [fileType, a.download, a.href].join(':');
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 11500);
  }

  // 切换了视频会触发这个事件
  // 实测好像点其他地方也会触发这个事件，
  document.addEventListener("selectionchange", function () {
    button2.textContent = get_download_current_episode_button_text()
  })

  function get_download_current_episode_button_text() {
    return `下载当前集 (${get_filename()}.srt)`
  }

  // 返回当前正在播放的视频标题
  function get_current_title() {
    var li = document.querySelector('li.session-item.active')
    var title = li.querySelector('.session-item-title')
    return title.innerText;
  }

  // 转换成安全的文件名
  function safe_filename(string) {
    return string.replace(':', '-')
  }

  // 当前视频的安全文件名
  function get_filename() {
    return safe_filename(get_current_title())
  }

  // 程序入口
  function main() {
    // 如果有标题才执行
    title_element = document.querySelector("div.class-details-header-title");
    if (title_element) {
      inject_our_script();
    }
  }

  setTimeout(main, 3000);
})();
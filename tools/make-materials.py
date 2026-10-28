"""Prepare reproducible copyright PDFs from actual, non-private project sources."""
import hashlib, json, math, pathlib, subprocess
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'private/copyright'
OUT.mkdir(parents=True, exist_ok=True)
NAME = '干啥不行目标规划管理软件'
VERSION = 'V1.0'
TITLE = NAME + ' ' + VERSION
OWNER = '柴元勋'
WIDTH, HEIGHT = A4
pdfmetrics.registerFont(TTFont('CJK', 'C:/Windows/Fonts/msyh.ttc', subfontIndex=0))
pdfmetrics.registerFont(TTFont('Mono', 'C:/Windows/Fonts/consola.ttf'))

def header(c, kind, page, total):
    c.setFillColorRGB(.12, .18, .14)
    c.setFont('CJK', 10)
    c.drawString(48, HEIGHT - 35, TITLE)
    c.setFont('CJK', 8)
    c.drawString(48, HEIGHT - 51, kind)
    c.drawRightString(WIDTH - 48, HEIGHT - 35, f'第 {page} 页  共 {total} 页')
    c.setFillColorRGB(.35, .4, .36)
    c.setFont('CJK', 8)
    c.drawString(48, 27, TITLE)

def wrap(text, font='CJK', size=11, width=WIDTH - 96):
    lines, line = [], ''
    for ch in text:
        if ch == '\n': lines.append(line); line = ''; continue
        if line and pdfmetrics.stringWidth(line + ch, font, size) > width:
            lines.append(line); line = ''
        line += ch
    if line: lines.append(line)
    return lines or ['']

def text_pdf(path, text, kind):
    # Thirty-four readable body lines per full page; natural last page is shorter.
    lines = []
    for raw in text.splitlines():
        if not raw.strip(): continue
        heading = raw.startswith('#')
        value = raw.lstrip('#').strip() if heading else raw
        for line in wrap(value, size=11): lines.append((line, heading))
    pages = [lines[i:i+34] for i in range(0, len(lines), 34)]
    c = canvas.Canvas(str(path), pagesize=A4)
    c.setTitle(TITLE + ' ' + kind); c.setAuthor(OWNER)
    for i, page in enumerate(pages, 1):
        header(c, kind, i, len(pages)); y = HEIGHT - 88
        for line, heading in page:
            c.setFillColorRGB(.08, .12, .09) if heading else c.setFillColorRGB(.16, .18, .17)
            c.setFont('CJK', 11)
            c.drawString(48, y, line); y -= 19.7
        c.showPage()
    c.save()
    return len(pages)

def code_width(text, size):
    return sum(pdfmetrics.stringWidth(ch, 'Mono' if ord(ch) < 128 else 'CJK', size) for ch in text)

def code_wrap(text, size=8.2):
    lines, line = [], ''
    for ch in text.expandtabs(4):
        if line and code_width(line + ch, size) > WIDTH - 118:
            lines.append(line); line = ''
        line += ch
    if line: lines.append(line)
    return lines

def draw_code(c, text, x, y, size=8.2):
    obj = c.beginText(x, y)
    font = None; run = ''
    for ch in text:
        current = 'Mono' if ord(ch) < 128 else 'CJK'
        if current != font:
            if run: obj.textOut(run)
            obj.setFont(current, size); font = current; run = ''
        run += ch
    if run: obj.textOut(run)
    c.drawText(obj)

def source_pdf():
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    prefixes = ('api/src/', 'api/public/', 'android/app/src/main/java/', 'android/app/src/main/res/')
    extensions = {'.mjs', '.js', '.html', '.css', '.java', '.xml', '.gradle'}
    extras = ['android/app/src/main/AndroidManifest.xml', 'android/app/build.gradle', 'android/build.gradle', 'android/settings.gradle', 'android/gradle.properties', 'api/package.json', 'api/.env.example', 'api/src/system-prompt.txt', 'start.ps1', '启动接口.cmd']
    files = sorted(f for f in tracked if f and ((f.startswith(prefixes) and pathlib.Path(f).suffix in extensions) or f in extras))
    manifest, body = [], []
    physical = nonempty = 0
    for name in files:
        data = (ROOT / name).read_bytes(); source = data.decode('utf-8-sig').splitlines()
        used = sum(bool(line.strip()) for line in source)
        manifest.append({'file': name, 'sha256': hashlib.sha256(data).hexdigest(), 'physicalLines': len(source), 'nonemptyLines': used})
        physical += len(source); nonempty += used
        for number, line in enumerate(source, 1):
            if not line.strip(): continue
            for part in code_wrap(line): body.append((name, number, part))
    pages = [body[i:i+50] for i in range(0, len(body), 50)]
    selected = list(range(len(pages))) if len(pages) <= 60 else list(range(30)) + list(range(len(pages)-30, len(pages)))
    c = canvas.Canvas(str(OUT / '源程序鉴别材料.pdf'), pagesize=A4)
    c.setTitle(TITLE + ' 源程序鉴别材料'); c.setAuthor(OWNER)
    for output_page, index in enumerate(selected, 1):
        page = pages[index]; header(c, f'源程序鉴别材料  原排版第 {index+1} 页  共 {len(pages)} 页', output_page, len(selected))
        y = HEIGHT - 81
        for name, number, line in page:
            c.setFillColorRGB(.5, .53, .51); c.setFont('Mono', 6.5); c.drawRightString(57, y, str(number))
            c.setFillColorRGB(.08, .1, .09); draw_code(c, line, 65, y); y -= 13.8
        c.setFont('Mono', 6.5); c.setFillColorRGB(.4, .43, .41)
        c.drawString(48, 43, page[0][0] + (' ... ' + page[-1][0] if page[-1][0] != page[0][0] else ''))
        c.showPage()
    c.save()
    metadata = {'software': NAME, 'version': VERSION, 'owner': OWNER, 'physicalLines': physical, 'nonemptyLines': nonempty, 'fullLayoutPages': len(pages), 'submittedPages': len(selected), 'files': manifest}
    (OUT / '源码统计与文件校验.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    return metadata

GUIDE = '''# 软著申请填报参考
软件全称：干啥不行目标规划管理软件
软件简称：干啥不行
版本号：V1.0
申请人及拟著作权人：柴元勋
著作权人类别：自然人
本文件是填报参考，不是官方申请表或证书；最终权利归属和可登记性由登记机构审查。

## 已准备材料
源程序鉴别材料：从实际生产源码按固定顺序提取，标明名称、版本和页码。排版全稿不满60页时交存全部，超过60页时按连续前30页和连续后30页提取，不通过重复代码凑页数。
操作说明书：说明实际软件的配置、规划、问卷、确认、记录、系统联动和限制。完整文档少于60页时交存全部。
界面操作示例：来自开发验收环境的演示目标截图，作为补充核对资料；不把示例文字当作对真实用户结果的保证。
源码统计与文件校验：记录实际文件、行数和 SHA-256，可与源码包核对。第三方 Gradle Wrapper 和系统库不列入自有源程序。

## 必须由本人如实补充
国籍、所在省市、证件类型和证件号码：按本人真实证件填写，不使用猜测值。
身份证明文件：按官方上传要求由本人提供，不放进公共 GitHub 仓库，也不需要在聊天中发送。
联系地址、邮编、手机等：在官方系统中按实填写。当前材料没有虚构这些内容。
开发完成日期：本次 V1.0 整理日期为2026年10月28日；最终填写实际完成并固定到载体的日期，本人核实后填写。
发表状态、首次发表日期和地点：当前交付没有替你公开 GitHub 仓库或发布 APK。公开仓库、网上发布或向他人提供软件复制件后，应根据真实情况重新判断发表状态，不得沿用未发表。
开发方式和取得方式：按真实开发、任职、合作和委托关系确认。项目为 AI 辅助开发，不能仅因使用 AI 就自动认定为某一种权属或保证登记通过；不要将未核实的原创、单独开发、原始取得声明直接签名提交。
权利范围：如确实享有全部权利可据实选择；如存在单位、合作方或他人授权，应先核对相应关系和证明，不得忽略。

## 技术与功能填报参考
开发及运行环境：Java 17、Android SDK 35、Gradle 8.11.1、Android Gradle Plugin 8.9.3；开发预览使用 Windows 和 Node.js 22或更新版本。运行于 Android 8.0及以上，需更新的系统 WebView；AI 分析需要网络和用户自备的 DeepSeek 账户密钥。
编程语言：Java、JavaScript、HTML、CSS；工程与资源另含 Groovy、XML、JSON、PowerShell及Windows启动脚本、AI提示词文本。源程序量以随包文件列表的实际统计口径填写，不估算或凑数。
开发目的：降低个人目标拆解和行动记录的使用门槛，帮助用户将目标转为需要本人确认的阶段规划与具体行动。
面向领域：个人目标规划与行动管理。
主要功能：目标输入与期限设置、AI 方案生成、一轮是非题补充、方案确认、本机目标与任务存储、完成二次确认与记录锁定、未完成行动删除、后续行动追加、目标达成与成就、安卓通知、日历编辑入口和记录导出。
技术特点：手机与电脑共用界面，安卓原生层提供 HTTPS、Keystore 加密和系统适配；校验 AI 输出、独立处理草案和执行状态、先保存再确认成功、保留锁定完成历史。

## 官方办理步骤
使用本人账号在中国版权保护中心登记平台注册并完成实名认证。选择计算机软件著作权登记，按实填写信息，核对软件名称、版本和材料一致。
上传鉴别材料和证明文件，按系统要求生成申请确认签章页。不要改动官方签章页的内容、格式和打印比例，由本人签名后按要求扫描为 PDF 上传。当前交付不会伪造签名、证件、官方表格或证书。
检查材料后由本人提交，之后关注受理、审查与补正通知。准备齐全材料不等于受理或登记已经完成，结果以官方审核为准。
官方所需文件要求一般交存源程序与一种文档连续前后各30页，不足60页交存全部；除特定情况，程序每页不少于50行，文档每页不少于30行。末页自然不足及图文资料应按官方实际审查要求核对。

## 官方依据与入口
办理步骤：https://www.ccopyright.com.cn/index.php?optionid=1079
所需文件：https://www.ccopyright.com.cn/index.php?optionid=1080
填表说明：https://www.ccopyright.com.cn/index.php?optionid=1081
登记入口：https://register.ccopyright.com.cn/registration.html#/registerSoft
核查日期：2026年10月28日。办理要求可能调整，提交前再以官方当前页面与系统提示为准。
'''

def screenshots_pdf():
    names = [('02-confirm.png', '行动完成前的再次确认', None), ('04-today.png', '今日行动与锁定记录', None), ('05-goals.png', '我的目标与后续安排', None), ('06-goal-achievement.png', '目标达成庆祝', None), ('07-settings.png', '密钥设置', (0, 0, 390, 788)), ('07-settings.png', '提醒与数据设置', (0, 788, 390, 1499))]
    c = canvas.Canvas(str(OUT / '界面操作示例.pdf'), pagesize=A4); c.setTitle(TITLE + ' 界面操作示例'); c.setAuthor(OWNER)
    from PIL import Image
    for i, (filename, label, crop) in enumerate(names, 1):
        header(c, '界面操作示例  ' + label, i, len(names))
        image_path = ROOT / 'artifacts/product' / filename
        with Image.open(image_path) as image:
            if crop: image = image.crop(crop)
            scale = min((WIDTH - 130) / image.width, (HEIGHT - 170) / image.height)
            w, h = image.width * scale, image.height * scale
            c.drawImage(ImageReader(image), (WIDTH-w)/2, HEIGHT-80-h, width=w, height=h)
        c.setFont('CJK', 8); c.drawString(48, 52, '软件开发验收环境中的演示目标，实际 AI 方案随用户目标变化。')
        c.showPage()
    c.save()

if __name__ == '__main__':
    meta = source_pdf()
    manual_pages = text_pdf(OUT / '操作说明书.pdf', (ROOT / 'docs/USER_GUIDE.md').read_text(encoding='utf-8-sig'), '操作说明书')
    guide = GUIDE + f'\n本次源码统计：非空行{meta["nonemptyLines"]}行，原始物理行{meta["physicalLines"]}行，排版全稿{meta["fullLayoutPages"]}页，交存{meta["submittedPages"]}页。\n'
    (OUT / '申请填报参考.md').write_text(guide, encoding='utf-8')
    text_pdf(OUT / '申请填报参考.pdf', guide, '申请填报参考')
    screenshots_pdf()
    print(json.dumps({'sourcePages': meta['submittedPages'], 'manualPages': manual_pages, 'nonemptySourceLines': meta['nonemptyLines']}, ensure_ascii=False))

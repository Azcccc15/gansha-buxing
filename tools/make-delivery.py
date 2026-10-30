"""Package only tracked source, and keep personal/signing archives separate."""
from pathlib import Path
import hashlib, json, re, shutil, subprocess, zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'deliverables'
OUT.mkdir(exist_ok=True)
files = [f for f in subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0') if f]
subprocess.run(['node', 'tools/check-release.mjs'], cwd=ROOT, check=True)
secrets = []
for name in ['api/.env', 'android/signing.properties']:
    path = ROOT / name
    if not path.exists(): continue
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        match = re.match(r'^(DEEPSEEK_API_KEY|APP_API_TOKEN|storePassword|keyPassword)\s*=\s*(.+)$', line)
        if match and len(match[2].strip()) >= 16: secrets.append(match[2].strip().strip('\"\'').encode())

def check_bytes(data, name):
    if any(secret in data for secret in secrets): raise RuntimeError('Secret found in publish file: ' + name)

source_manifest = []
with zipfile.ZipFile(OUT / 'GitHub源码上传包-v1.0.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        data = (ROOT / name).read_bytes(); check_bytes(data, name)
        info = zipfile.ZipInfo('gansha-buxing/' + name)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = (0o100755 if name == 'android/gradlew' else 0o100644) << 16
        archive.writestr(info, data)
        source_manifest.append({'file': name, 'sha256': hashlib.sha256(data).hexdigest()})
    archive.writestr('gansha-buxing/SOURCE_MANIFEST.json', json.dumps(source_manifest, ensure_ascii=False, indent=2))

apk = ROOT / 'android/app/build/outputs/apk/release/app-release.apk'
with zipfile.ZipFile(apk) as archive:
    for name in archive.namelist(): check_bytes(archive.read(name), name)
    for name in ['home.html','app.js','goals.js','store.js','transport.js','styles.css','settings.css','appui.css']:
        assert archive.read('assets/web/' + name) == (ROOT / 'api/public' / name).read_bytes(), 'APK/source mismatch: ' + name
    assert archive.read('assets/system-prompt.txt') == (ROOT / 'api/src/system-prompt.txt').read_bytes()
shutil.copyfile(apk, OUT / 'gansha-buxing-v1.0.apk')

materials = ROOT / 'private/copyright'
metadata = json.loads((materials / '源码统计与文件校验.json').read_text(encoding='utf-8'))
for item in metadata['files']:
    assert hashlib.sha256((ROOT / item['file']).read_bytes()).hexdigest() == item['sha256'], 'Stale source material: ' + item['file']
with zipfile.ZipFile(OUT / '软著申请材料-柴元勋-v1.0.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(materials.iterdir()):
        if path.is_file(): archive.write(path, path.name)

with zipfile.ZipFile(OUT / '签名私密备份-禁止公开.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.write(ROOT / 'private/gansha-release.jks', 'private/gansha-release.jks')
    archive.write(ROOT / 'android/signing.properties', 'android/signing.properties')
    archive.writestr('保管说明.txt', '此包包含发布签名及其配置。不要上传 GitHub 或公开分享。请在安全位置另存一份，后续升级必须使用同一签名。这里不包含 DeepSeek API 密钥。')

readme = f'''# 交付说明

软件：干啥不行目标规划管理软件 V1.0
拟著作权人：柴元勋（个人，按本人提供的信息准备）

## 文件怎么用

- gansha-buxing-v1.0.apk：正式签名的安卓安装包，传到手机后安装；在软件“设置”里填自己的 DeepSeek 密钥。
- GitHub源码上传包-v1.0.zip：解压后上传自己的仓库。默认建议先用私密仓库，实际公开后须核对软著发表状态。
- 软著申请材料-柴元勋-v1.0.zip：包含源程序鉴别材料 {metadata['submittedPages']} 页、操作说明书、申请填报参考、界面操作示例和源码统计校验。先解压，再按官方栏目选择PDF；不是把整个ZIP直接当申请材料上传。
- 签名私密备份-禁止公开.zip：只供自己保管，不上传仓库或公开 Release。后续更新应用需要同一签名。

## 已验证与仍需自己完成

67项Node检查、4项安卓Java校验测试、浏览器完整操作流程、正式包构建、Android Lint零问题和APK签名校验通过。源码、材料和APK资源已核对，公开源码包未包含真实密钥或签名。

尚未在你的安卓手机实测。电脑模拟器未正常启动，不能据此宣布通知、重启恢复、系统日历、文件导出和手机密钥留存已经设备验收通过。请先在实际手机试用；没有进行商店上架或公网部署。

GitHub源码仓库：https://github.com/Azcccc15/gansha-buxing 。首次源码上传的接口测试和安卓构建两项远程检查均已成功，记录为 https://github.com/Azcccc15/gansha-buxing/actions/runs/40702968762 。安卓体验版下载和发布记录见 https://github.com/Azcccc15/gansha-buxing/releases/tag/v1.0.0 及 docs/RELEASE.md；仓库可见性以 GitHub 当前设置为准。

软著尚未提交。你需要在中国版权保护中心完成本人实名认证、补齐真实证件与联系资料、核实开发方式和权属、按实际填写完成和发表信息、本人签署系统生成的签章页后提交。不要将身份证明放进公共仓库。材料齐全不代表官方审核已通过。

官方入口：https://register.ccopyright.com.cn/registration.html#/registerSoft
官方所需文件：https://www.ccopyright.com.cn/index.php?optionid=1080

完整源码量统计口径与文件SHA-256见申请材料内的统计文件；源程序不足60页时交存全部，未复制代码凑页。
'''
(OUT / '先读我-交付说明.md').write_text(readme, encoding='utf-8')
hashes = []
for path in sorted(OUT.iterdir()):
    if path.is_file() and path.name != 'SHA256SUMS.txt': hashes.append(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.name)
(OUT / 'SHA256SUMS.txt').write_text('\n'.join(hashes) + '\n', encoding='utf-8')
print(json.dumps({'publicSourceFiles': len(files), 'sourcePages': metadata['submittedPages'], 'artifacts': [p.name for p in OUT.iterdir()]}, ensure_ascii=False))

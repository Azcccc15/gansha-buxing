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
with zipfile.ZipFile(OUT / 'GitHubԴ���ϴ���-v1.0.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
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
metadata = json.loads((materials / 'Դ��ͳ�����ļ�У��.json').read_text(encoding='utf-8'))
for item in metadata['files']:
    assert hashlib.sha256((ROOT / item['file']).read_bytes()).hexdigest() == item['sha256'], 'Stale source material: ' + item['file']
with zipfile.ZipFile(OUT / '�����������-��Ԫѫ-v1.0.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(materials.iterdir()):
        if path.is_file(): archive.write(path, path.name)

with zipfile.ZipFile(OUT / 'ǩ��˽�ܱ���-��ֹ����.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.write(ROOT / 'private/gansha-release.jks', 'private/gansha-release.jks')
    archive.write(ROOT / 'android/signing.properties', 'android/signing.properties')
    archive.writestr('����˵��.txt', '�˰���������ǩ���������á���Ҫ�ϴ� GitHub �򹫿����������ڰ�ȫλ������һ�ݣ�������������ʹ��ͬһǩ�������ﲻ���� DeepSeek API ��Կ��')

readme = f'''# ����˵��

��������ɶ����Ŀ��滮�������� V1.0
������Ȩ�ˣ���Ԫѫ�����ˣ��������ṩ����Ϣ׼����

## �ļ���ô��

- gansha-buxing-v1.0.apk����ʽǩ���İ�׿��װ���������ֻ���װ�������������á������Լ��� DeepSeek ��Կ��
- GitHubԴ���ϴ���-v1.0.zip����ѹ���ϴ��Լ��Ĳֿ⡣Ĭ�Ͻ�������˽�ֿܲ⣬ʵ�ʹ�������˶���������״̬��
- �����������-��Ԫѫ-v1.0.zip������Դ���������� {metadata['submittedPages']} ҳ������˵���顢������ο����������ʾ����Դ��ͳ��У�顣�Ƚ�ѹ���ٰ��ٷ���Ŀѡ��PDF�����ǰ�����ZIPֱ�ӵ���������ϴ���
- ǩ��˽�ܱ���-��ֹ����.zip��ֻ���Լ����ܣ����ϴ��ֿ�򹫿� Release����������Ӧ����Ҫͬһǩ����

## ����֤�������Լ����

67��Node��顢4�׿JavaУ����ԡ�����������������̡���ʽ��������Android Lint�������APKǩ��У��ͨ����Դ�롢���Ϻ�APK��Դ�Ѻ˶ԣ�����Դ���δ������ʵ��Կ��ǩ����

��δ����İ�׿�ֻ�ʵ�⡣����ģ����δ�������������ܾݴ�����֪ͨ�������ָ���ϵͳ�������ļ��������ֻ���Կ�����Ѿ��豸����ͨ����������ʵ���ֻ����ã�û�н����̵��ϼܻ�������

GitHubԴ��ֿ⣺https://github.com/Azcccc15/gansha-buxing ���״�Դ���ϴ��Ľӿڲ��ԺͰ�׿��������Զ�̼����ѳɹ�����¼Ϊ https://github.com/Azcccc15/gansha-buxing/actions/runs/40702968762 ����׿��������غͷ�����¼�� https://github.com/Azcccc15/gansha-buxing/releases/tag/v1.0.0 �� docs/RELEASE.md���ֿ�ɼ����� GitHub ��ǰ����Ϊ׼��

������δ�ύ������Ҫ���й���Ȩ����������ɱ���ʵ����֤��������ʵ֤������ϵ���ϡ���ʵ������ʽ��Ȩ������ʵ����д��ɺͷ�����Ϣ������ǩ��ϵͳ���ɵ�ǩ��ҳ���ύ����Ҫ������֤���Ž������ֿ⡣������ȫ�������ٷ������ͨ����

�ٷ���ڣ�https://register.ccopyright.com.cn/registration.html#/registerSoft
�ٷ������ļ���https://www.ccopyright.com.cn/index.php?optionid=1080

����Դ����ͳ�ƿھ����ļ�SHA-256����������ڵ�ͳ���ļ���Դ������60ҳʱ����ȫ����δ���ƴ����ҳ��
'''
(OUT / '�ȶ���-����˵��.md').write_text(readme, encoding='utf-8')
hashes = []
for path in sorted(OUT.iterdir()):
    if path.is_file() and path.name != 'SHA256SUMS.txt': hashes.append(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.name)
(OUT / 'SHA256SUMS.txt').write_text('\n'.join(hashes) + '\n', encoding='utf-8')
print(json.dumps({'publicSourceFiles': len(files), 'sourcePages': metadata['submittedPages'], 'artifacts': [p.name for p in OUT.iterdir()]}, ensure_ascii=False))

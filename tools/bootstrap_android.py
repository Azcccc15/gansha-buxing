"""Download verified Android build tools into a separate, local-only cache."""
import concurrent.futures, hashlib, pathlib, urllib.request, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT.parent / '.gansha-tools'
CACHE.mkdir(exist_ok=True)

def download(name, url, digest, algorithm='sha1'):
    target = CACHE / name
    if not target.exists():
        with urllib.request.urlopen(url, timeout=90) as source, target.open('wb') as output:
            while chunk := source.read(1024 * 1024):
                output.write(chunk)
    actual = hashlib.new(algorithm, target.read_bytes()).hexdigest()
    if actual != digest.strip().split()[0]:
        raise RuntimeError('Checksum mismatch: ' + name)
    print('Verified ' + name, flush=True)
    return target

def install(item):
    name, url, digest, algorithm, dest = item
    archive = download(name, url, digest, algorithm)
    marker = CACHE / (name + '.installed')
    if not marker.exists():
        with zipfile.ZipFile(archive) as z:
            base = pathlib.Path(dest).resolve()
            for entry in z.infolist():
                if not (base / entry.filename).resolve().is_relative_to(base):
                    raise RuntimeError('Unsafe archive path')
            z.extractall(dest)
        marker.write_text('ok')

if __name__ == '__main__':
    jdk_url = 'https://cdn.azul.com/zulu/bin/zulu17.70.111-ca-jdk17.0.21-win_x64.zip'
    jdk_hash = 'ed209ff4293ff581c81d3b4268faf108fbe610e6ed43883de9e5f04308d68a72'
    gradle_url = 'https://downloads.gradle.org/distributions/gradle-8.11.1-bin.zip'
    gradle_hash = urllib.request.urlopen(gradle_url + '.sha256', timeout=60).read().decode().strip()
    repo = 'https://dl.google.com/android/repository/'
    jobs = [
        ('jdk-zulu.zip', jdk_url, jdk_hash, 'sha256', CACHE / 'jdk'),
        ('gradle.zip', gradle_url, gradle_hash, 'sha256', CACHE),
        ('platform35.zip', repo + 'platform-35_r02.zip', '0bb560a90a7a2cbd0dd8348224d518b638fe7949', 'sha1', CACHE / 'sdk/platforms'),
        ('build-tools35.zip', repo + 'build-tools_r35_windows.zip', 'af059bb67cf7786f45ee0db85e2d24985df1b4b6', 'sha1', CACHE / 'sdk/build-tools'),
        ('platform-tools.zip', repo + 'platform-tools_r37.0.1-win.zip', 'e03e78b1d80b396f1c3358e31251cb31740e1110', 'sha1', CACHE / 'sdk'),
    ]
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        list(pool.map(install, jobs))
    build_tools = CACHE / 'sdk/build-tools/android-15'
    if build_tools.exists() and not (CACHE / 'sdk/build-tools/35.0.0').exists():
        build_tools.rename(CACHE / 'sdk/build-tools/35.0.0')
    print('Toolchains ready in ' + str(CACHE), flush=True)

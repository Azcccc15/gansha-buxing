"""Optional isolated Android 35 emulator for local acceptance checks."""
import concurrent.futures
from bootstrap_android import CACHE, install

if __name__ == '__main__':
    jobs = [
        ('emulator.zip', 'https://dl.google.com/android/repository/emulator-windows_x64-16632760.zip', '5ecdf654031e9791e20c336c8d87d2238cb69f3a', 'sha1', CACHE / 'sdk'),
        ('image35.zip', 'https://dl.google.com/android/repository/sys-img/android/x86_64-35_r02.zip', '2d857d170c0d1b827149565da34b3383e5306f7f', 'sha1', CACHE / 'sdk/system-images/android-35/default'),
    ]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(install, jobs))
    avd = CACHE / 'avd/Gansha35.avd'; avd.mkdir(parents=True, exist_ok=True)
    (avd.parent / 'Gansha35.ini').write_text('avd.ini.encoding=UTF-8\npath=' + str(avd) + '\ntarget=android-35\n', encoding='utf-8')
    (avd / 'config.ini').write_text('\n'.join([
        'avd.ini.encoding=UTF-8', 'AvdId=Gansha35', 'avd.ini.displayname=Gansha35', 'abi.type=x86_64', 'tag.id=default', 'hw.cpu.arch=x86_64',
        'image.sysdir.1=system-images/android-35/default/x86_64/', 'hw.ramSize=2048', 'hw.cpu.ncore=2', 'hw.lcd.width=1080', 'hw.lcd.height=1920',
        'hw.lcd.density=420', 'hw.gpu.enabled=yes', 'hw.gpu.mode=swiftshader', 'disk.dataPartition.size=2G', 'showDeviceFrame=no', 'fastboot.forceColdBoot=yes', ''
    ]), encoding='utf-8')
    print('Isolated emulator prepared: Gansha35', flush=True)

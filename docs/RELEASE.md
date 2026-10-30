# GitHub ��������

1. ��ʹ��˽�ֿܲⱣ����롣����Ŀ¼�е� GitHub Դ���������ʵ��Կ��ǩ���ļ�������������ϻ򱾵ع��߻��档
2. ���Լ��� GitHub �˺��½��ղֿ⣬����ֿ��� gansha-buxing����Դ�����ѹ��������ϴ�����������ĿĿ¼�����Լ���Զ�ֿ̲��ַ������ main ��֧��
3. �ֿ����ṩ�Զ�������̣�Node �ӿں����ݹ����顢��׿���԰������� Android Lint��Զ��ִ�н��Ҫ�� Actions ҳ���ʵ������ͨ��������Զ���Ѿ����С�
4. ��װ������ͨ�� GitHub Releases �������汾��ǩ v1.0.0����������ʽǩ�� APK �� CI �Զ����ɵĵ��԰��ֿ�ʹ�á�ǩ��˽�ܱ��ݱ��뵥�����ܣ����ϴ��ֿ�򹫿� Release��
5. ������ʹ�ÿ�Դ����֤����Ҫ��Ȩ��������ѡ��Ŀǰֻ�ṩȨ������˵�����������ʲ����� MIT �� Apache ��Ȩ��
6. �����ֿ�򹫿�������װ������Ӱ�����������еġ�����״̬�����״ι������ڡ��ص�Ϳ����������Ӧ��ʵ�������д�������ڹ��������������δ������

2026��10��28���Ѵ����ֿ� https://github.com/Azcccc15/gansha-buxing ���ϴ� main ��֧���״�Դ���ϴ��Ľӿڲ����밲׿����������ͨ����

2026��10��30���ѷ��� [V1.0 ��׿�����](https://github.com/Azcccc15/gansha-buxing/releases/tag/v1.0.0)���� GitHub ��Ϊ Pre-release������Ϊ��ʽǩ���� `gansha-buxing-v1.0.apk` �ͽ�У��� APK �� `SHA256SUMS.txt`����ҳ�ṩֱ�����ذ�ť���ֿ�ɼ����� GitHub ҳ��ʵ�ʱ��Ϊ׼�������������������¼����δ�ύ�������룬����״̬������Ӧ��ʵ�ʹ�����¼��ʵ��

## �����������

- ��Ŀ��ҳ��https://github.com/Azcccc15/gansha-buxing
- �汾˵����https://github.com/Azcccc15/gansha-buxing/releases/tag/v1.0.0
- APK ֱ����https://github.com/Azcccc15/gansha-buxing/releases/download/v1.0.0/gansha-buxing-v1.0.apk
- APK SHA-256��`3441caf40c3a5579d456ebd86a69dd41b489deae1df7d1e842adad9d8cd235f9`

�����Դ�����������׶Σ�δ���������ա����غ����û���ϵͳ��ʾȷ�ϰ�װ���������������������Լ��� DeepSeek API ��Կ��API ʹ���û��˻���ȣ��������ṩ������Կ��

�����汾Ӧʹ���±�ǩ�Ͷ�Ӧ��װ����������ҳ�������ӡ��ϴ�ǰ��鵱ǰ�ļ�����������ʷ�� APK ���ݣ�ȷ�ϲ�����ʵ���á�ǩ��˽Կ�����������ϣ���Ҫֱ�Ӱ����� `deliverables` Ŀ¼�ϴ�����Ϊ����ͬʱ������˽�ܽ����ļ���

## ��������

ʹ�� JDK 17��Android SDK 35��Build Tools 35.0.0��Gradle 8.11.1��Android Gradle Plugin 8.9.3��ʹ�� Android Studio �� android �ļ��к�ͬ��������Ҳ��ʹ�� Gradle Wrapper��

��׿Դ��ʹ�� Java 17����� Android 8.0��API 26������Ҫ���µ� Android System WebView������ʱֻ����ϵͳ�⣬�޹������ SDK��������Դ�ɹ�������� api/public ͬ����AI ��ʾ�ʴ� api/src/system-prompt.txt ͬ�������޸�Դ�ļ���������Ŀ¼��

��ʽǩ���ڱ��� android/signing.properties ���ã�ʾ��Ϊ android/signing.properties.example�����ü���Ӧǩ���ļ��������ֿ⡣û��ǩ������ʱ assembleRelease ֻ����δǩ��������ܽ��䵱����ǩ����װ��������

Windows ����Ŀ¼����Ӱ�� Java ���Խ��̣���ʹ�� tools/build-android-ascii.ps1 -Release���ڱ�����ʱĿ¼�����ܱ�Ǳ����Ĺ�������������ͨ�����Ʋ���ͱ������Ŀ����ʱǩ���������ڽ���ʱ�Ƴ���ʹ��ǰ����׼���������ߺ�ǩ������ϸ��֤����豸ȷ�Ϸ�Χ�� docs/VERIFICATION.md��

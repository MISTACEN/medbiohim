import olefile
import sys

doc_path = r'C:\Users\MISTACEN\Desktop\вуз\06_Физиология\Учебники и атласы\Физ.крови-эндМБХ 22.doc'
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ole = olefile.OleFileIO(doc_path)
print('OLE streams:')
for stream in ole.listdir():
    sname = '/'.join(stream)
    try:
        data = ole.openstream(sname).read()
        print(f'Stream: {sname}, size: {len(data)}')
    except Exception as e:
        print(f'Stream: {sname}, error: {e}')

ole.close()

"""Extract text from .doc file - copy first to avoid protected view"""
import sys, os, tempfile, shutil
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

doc_path = r'C:\Users\MISTACEN\Desktop\вуз\06_Физиология\Учебники и атласы\Физ.крови-эндМБХ 22.doc'

# Copy to temp to avoid protected view
copy_path = os.path.join(tempfile.gettempdir(), 'temp_methodicka_copy.doc')
shutil.copy2(doc_path, copy_path)

output_path = os.path.join(tempfile.gettempdir(), 'methodicka_output.txt')

try:
    import win32com.client
    word = win32com.client.Dispatch('Word.Application')
    word.Visible = False
    word.DisplayAlerts = False
    
    doc = word.Documents.Open(copy_path)
    doc.SaveAs(output_path, 2)  # 2 = wdFormatText
    doc.Close()
    word.Quit()
    
    size = os.path.getsize(output_path)
    print(f'OK: saved to {output_path}, size={size}')
    
except Exception as e:
    print(f'Error: {e}', file=sys.stderr)
    import traceback
    traceback.print_exc()
finally:
    if os.path.exists(copy_path):
        os.remove(copy_path)

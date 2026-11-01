"""Reproducible distribution without deployment identity, runtime data or secrets."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import sys
root=Path(__file__).resolve().parent.parent
output=Path(sys.argv[1] if len(sys.argv)>1 else root/'dist'/'BTC_Glass_Desk.zip')
output.parent.mkdir(parents=True,exist_ok=True)
excluded={'.git','.openai','node_modules','dist','data','.sites-runtime'}
with ZipFile(output,'w',ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob('*')):
        if not path.is_file():continue
        rel=path.relative_to(root)
        if any(p in excluded for p in rel.parts):continue
        if path.name.startswith('.env') and path.name!='.env.example':continue
        if path.suffix in {'.zip','.log','.sqlite','.csv'} or path.name.startswith('qa-'):continue
        archive.write(path,Path('BTC_Glass_Desk')/rel)
print(str(output))

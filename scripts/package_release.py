"""Build an application-only ZIP. Never package local databases, media or secrets."""
import argparse
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
SUFFIXES = {'.py', '.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.mp4'}


def build_zip(destination, root=ROOT):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    names = ['manage.py', 'requirements.txt', 'scripts/startup.sh', 'scripts/release.py']
    for folder in ['muro', 'wall', 'piloto']:
        for path in sorted((root / folder).rglob('*')):
            relative = path.relative_to(root)
            if path.is_file() and path.suffix in SUFFIXES and not any(part.startswith('.') or part == '__pycache__' for part in relative.parts):
                if path.is_symlink() or any(parent.is_symlink() for parent in path.parents if parent != root):
                    raise ValueError('No se incluyen enlaces simbólicos: ' + str(relative))
                names.append(relative.as_posix())
    with ZipFile(destination, 'w', ZIP_DEFLATED) as archive:
        for name in names:
            if (root / name).is_symlink():
                raise ValueError('No se incluyen enlaces simbólicos: ' + name)
            archive.write(root / name, name)
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default=str(ROOT / 'dist' / 'muro.zip'))
    args = parser.parse_args()
    print(build_zip(args.output))

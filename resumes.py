"""DOCX text slots and local PDF export. The template owns all formatting."""
import base64
import difflib
import io
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile
from xml.sax.saxutils import escape
from xml.dom import minidom
from xml.parsers.expat import ExpatError
from zipfile import ZipFile, BadZipFile

HEADINGS = {'教育经历', '个人简介', '工作经历', '数据能力与工具'}


def template_bytes(template):
    try:
        raw = base64.b64decode(template['data'].split(',', 1)[1], validate=True)
        if len(raw) > 10 * 1024 * 1024:
            raise ValueError('母版不能超过 10 MB')
        with ZipFile(io.BytesIO(raw)) as archive:
            if sum(f.file_size for f in archive.infolist()) > 32 * 1024 * 1024:
                raise ValueError('DOCX 解压内容过大')
            archive.read('word/document.xml')
        return raw
    except (KeyError, IndexError, BadZipFile, TypeError, AttributeError, OSError) as exc:
        raise ValueError('无法读取 DOCX 母版') from exc


def slots(raw):
    try:
        with ZipFile(io.BytesIO(raw)) as archive:
            document = minidom.parseString(archive.read('word/document.xml'))
    except ExpatError as exc:
        raise ValueError('DOCX 文字结构损坏，无法导入') from exc
    result, section = [], '基本信息'
    for index, paragraph in enumerate(document.getElementsByTagName('w:p')):
        text = ''.join(node.firstChild.data if node.firstChild else ''
                       for node in paragraph.getElementsByTagName('w:t'))
        if not text.strip():
            continue
        heading = text.strip() in HEADINGS
        if heading:
            section = text.strip()
        result.append({'key': str(index), 'text': text, 'section': section, 'heading': heading})
    if not result:
        raise ValueError('母版没有可编辑文字')
    return result


def validate_resumes(state):
    templates, versions = state.get('resumeTemplates', []), state.get('resumes', [])
    if not isinstance(templates, list) or not isinstance(versions, list):
        raise ValueError('简历数据必须是列表')
    for items in (templates, versions):
        ids = [x.get('id') if isinstance(x, dict) else None for x in items]
        if any(not isinstance(x, str) or not x for x in ids) or len(ids) != len(set(ids)):
            raise ValueError('简历 ID 无效或重复')
    known = {}
    for template in templates:
        known[template['id']] = {slot['key'] for slot in slots(template_bytes(template)) if not slot['heading']}
        styles = template.get('paragraphStyles', {})
        if not isinstance(styles, dict) or any(k not in known[template['id']] or
                v not in ('label', 'plain') for k, v in styles.items()):
            raise ValueError('简历段落样式无效')
        if not isinstance(template.get('name'), str):
            raise ValueError('母版名称无效')
    for version in versions:
        if version.get('templateId') not in known or not isinstance(version.get('name'), str):
            raise ValueError('简历缺少名称或母版')
        fields = version.get('fields')
        if not isinstance(fields, dict) or any(k not in known[version['templateId']] or
                not isinstance(v, str) or len(v) > 16000 for k, v in fields.items()):
            raise ValueError('简历文字或段落无效；不能修改固定标题')


def format_paragraph(document, paragraph, style):
    runs = list(paragraph.getElementsByTagName('w:r'))
    text = ''.join(n.firstChild.data if n.firstChild else ''
                   for n in paragraph.getElementsByTagName('w:t'))
    colon = re.search('[：:]', text) if style == 'label' else None
    boundary = colon.end() if colon else 0
    offset = 0
    for run in runs:
        nodes = list(run.getElementsByTagName('w:t'))
        value = ''.join(n.firstChild.data if n.firstChild else '' for n in nodes)
        if not nodes:
            continue
        cut = max(0, min(len(value), boundary - offset))
        offset += len(value)
        for part, bold in ((value[:cut], True), (value[cut:], False)):
            if not part:
                continue
            new = run.cloneNode(True)
            for node in list(new.childNodes):
                if node.nodeType == node.ELEMENT_NODE and node.tagName != 'w:rPr':
                    new.removeChild(node)
            props = new.getElementsByTagName('w:rPr')
            props = props[0] if props else document.createElement('w:rPr')
            if not props.parentNode:
                new.insertBefore(props, new.firstChild)
            for tag in ('w:b', 'w:bCs'):
                for node in list(props.getElementsByTagName(tag)):
                    node.parentNode.removeChild(node)
                node = document.createElement(tag)
                node.setAttribute('w:val', '1' if bold else '0')
                props.appendChild(node)
            node = document.createElement('w:t')
            node.setAttribute('xml:space', 'preserve')
            node.appendChild(document.createTextNode(part))
            new.appendChild(node)
            run.parentNode.insertBefore(new, run)
        run.parentNode.removeChild(run)


def build_docx(template, version):
    raw = template_bytes(template)
    fields = version.get('fields', {})
    allowed = {s['key'] for s in slots(raw) if not s['heading']}
    if any(key not in allowed for key in fields):
        raise ValueError('简历含未知段落或固定标题')
    output = io.BytesIO()
    with ZipFile(io.BytesIO(raw)) as source:
        document = minidom.parseString(source.read('word/document.xml'))
        paragraphs = document.getElementsByTagName('w:p')
        changed = False
        for key, replacement in fields.items():
            nodes = list(paragraphs[int(key)].getElementsByTagName('w:t'))
            original_parts = [n.firstChild.data if n.firstChild else '' for n in nodes]
            original = ''.join(original_parts)
            if original == replacement:
                continue
            changed = True
            # Map edits into existing runs; explicit paragraph rules below own bold.
            # Fonts, tables, pictures and every other ZIP part stay intact.
            owners = [i for i, value in enumerate(original_parts) for _ in value]
            pieces = ['' for _ in nodes]
            for tag, a, b, c, d in difflib.SequenceMatcher(None, original, replacement, autojunk=False).get_opcodes():
                if tag == 'equal':
                    for offset, character in enumerate(replacement[c:d]):
                        pieces[owners[a + offset]] += character
                elif tag in ('insert', 'replace'):
                    pieces[owners[min(a, len(owners) - 1)]] += replacement[c:d]
            for node, value in zip(nodes, pieces):
                while node.firstChild:
                    node.removeChild(node.firstChild)
                node.appendChild(document.createTextNode(value))
                node.setAttribute('xml:space', 'preserve')
        if not version.get('isMaster'):
            for key, style in template.get('paragraphStyles', {}).items():
                format_paragraph(document, paragraphs[int(key)], style)
                changed = True
        if not changed:
            return raw
        with ZipFile(output, 'w') as target:
            for item in source.infolist():
                target.writestr(item, document.toxml(encoding='UTF-8') if item.filename == 'word/document.xml' else source.read(item.filename))
    return output.getvalue()


def pdf_renderer():
    configured = os.environ.get('JOBCAT_SOFFICE')
    bundled = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/libreoffice-headless/libreoffice/LibreOfficeDev.app/Contents/MacOS/soffice'
    if configured and Path(configured).is_file():
        return configured
    if bundled.is_file():
        return str(bundled)
    found = shutil.which('soffice')
    if found:
        return found
    raise ValueError('PDF 导出需要本机 LibreOffice。请安装或设置 JOBCAT_SOFFICE；文字保存不受影响。')


def export_pdf(template, version):
    with tempfile.TemporaryDirectory(prefix='jobcat-cv-') as folder:
        root = Path(folder)
        source = root / 'resume.docx'
        source.write_bytes(build_docx(template, version))
        env = os.environ.copy()
        # Office's bundled fonts are not always visible to headless LibreOffice.
        # Point this process at the installed fonts without changing the system.
        office_fonts = Path('/Applications/Microsoft Word.app/Contents/Resources/DFonts')
        if office_fonts.is_dir() and not env.get('SAL_FONTPATH_PRIVATE'):
            env['SAL_FONTPATH_PRIVATE'] = str(office_fonts)
        if office_fonts.is_dir() and not env.get('FONTCONFIG_FILE'):
            config = root / 'fonts.conf'
            config.write_text('<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>'
                              '<dir>' + escape(str(office_fonts)) + '</dir>'
                              '<dir>/System/Library/Fonts</dir><dir>/Library/Fonts</dir>'
                              '<cachedir>' + escape(str(root / 'font-cache')) + '</cachedir>'
                              '<alias><family>微软雅黑</family><prefer><family>Microsoft YaHei</family></prefer></alias>'
                              '<alias><family>宋体</family><prefer><family>SimSun</family></prefer></alias>'
                              '</fontconfig>')
            env['FONTCONFIG_FILE'] = str(config)
        try:
            result = subprocess.run([pdf_renderer(), '-env:UserInstallation=' + (root / 'profile').as_uri(),
                                     '--headless', '--convert-to', 'pdf', '--outdir', str(root), str(source)],
                                    capture_output=True, timeout=90, env=env)
        except subprocess.TimeoutExpired as exc:
            raise ValueError('PDF 生成超时，请稍后重试；已保存文字不会丢失') from exc
        pdf = root / 'resume.pdf'
        if result.returncode != 0 or not pdf.is_file():
            raise ValueError('PDF 转换失败，请检查本机 LibreOffice 和字体')
        return pdf.read_bytes()

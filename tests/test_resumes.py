import base64
import io
import unittest
from zipfile import ZipFile
from xml.dom import minidom
from resumes import slots, build_docx, validate_resumes


def fixture():
    out=io.BytesIO()
    with ZipFile(out,'w') as z:
        z.writestr('word/document.xml','''<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>个人简介</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:after="20"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>业务分析：</w:t></w:r><w:r><w:rPr><w:rFonts w:eastAsia="微软雅黑"/></w:rPr><w:t>原始文字</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>''')
        z.writestr('word/media/image1.jpg',b'photo-preserved')
        z.writestr('word/styles.xml',b'styles-preserved')
    raw=out.getvalue()
    return raw,{'id':'t','name':'Template','data':'data:application/octet-stream;base64,'+base64.b64encode(raw).decode()}


class ResumeTests(unittest.TestCase):
    def test_unchanged_template_is_byte_identical(self):
        raw,t=fixture()
        self.assertEqual(build_docx(t,{'fields':{'1':'业务分析：原始文字'}}),raw)

    def test_edit_keeps_package_and_run_formatting(self):
        raw,t=fixture()
        edited=build_docx(t,{'fields':{'1':'业务分析：修改后的文字 & <测试>'}})
        with ZipFile(io.BytesIO(raw)) as a,ZipFile(io.BytesIO(edited)) as b:
            for name in a.namelist():
                if name!='word/document.xml':self.assertEqual(a.read(name),b.read(name))
            doc=minidom.parseString(b.read('word/document.xml'))
            text=''.join(n.firstChild.data if n.firstChild else '' for n in doc.getElementsByTagName('w:p')[1].getElementsByTagName('w:t'))
            self.assertEqual(text,'业务分析：修改后的文字 & <测试>')
            self.assertEqual(len(doc.getElementsByTagName('w:b')),1)
            self.assertEqual(doc.getElementsByTagName('w:pgSz')[0].getAttribute('w:w'),'12240')

    def test_missing_template_unknown_slot_and_fixed_heading_rejected(self):
        raw,t=fixture()
        self.assertTrue(slots(raw)[0]['heading'])
        for fields in ({'0':'改标题'},{'99':'未知段落'}):
            with self.assertRaises(ValueError):validate_resumes({'resumeTemplates':[t],'resumes':[{'id':'v','name':'CV','templateId':'t','fields':fields}]})
        with self.assertRaises(ValueError):validate_resumes({'resumes':[{'id':'v','name':'CV','templateId':'missing','fields':{}}]})

    def test_label_bold_stops_at_new_colon_and_survives_repeated_edits(self):
        _,t=fixture()
        t['paragraphStyles']={'1':'label'}
        for text in ('用户问题记录与跟进：在用户测试过程中，整理问题记录。',
                     '答疑:更长的正文不应继承标题加粗', '删除冒号后整段使用常规字重'):
            edited=build_docx(t,{'fields':{'1':text}})
            with ZipFile(io.BytesIO(edited)) as z:
                doc=minidom.parseString(z.read('word/document.xml'))
            parts=[]
            for r in doc.getElementsByTagName('w:p')[1].getElementsByTagName('w:r'):
                value=''.join(n.firstChild.data if n.firstChild else '' for n in r.getElementsByTagName('w:t'))
                bold=r.getElementsByTagName('w:b')
                parts.extend((c,bool(bold and bold[0].getAttribute('w:val')!='0')) for c in value)
            colon=next((i+1 for i,c in enumerate(text) if c in '：:'),0)
            self.assertEqual(parts,[(c,i<colon) for i,c in enumerate(text)])
            t['data']='data:application/octet-stream;base64,'+base64.b64encode(edited).decode()

    def test_plain_rule_clears_inherited_bold_but_master_stays_original(self):
        raw,t=fixture();t['paragraphStyles']={'1':'plain'}
        self.assertEqual(build_docx(t,{'isMaster':True,'fields':{}}),raw)
        with ZipFile(io.BytesIO(build_docx(t,{'fields':{}}))) as z:
            doc=minidom.parseString(z.read('word/document.xml'))
        self.assertTrue(all(n.getAttribute('w:val')=='0' for n in doc.getElementsByTagName('w:b')))


if __name__=='__main__':unittest.main()

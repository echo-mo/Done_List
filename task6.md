# 编写代码，添加功能

## 附件文件

这个路径下是一个github项目，已经实现了一个基本网页和前后端的数据同步，在zeabur网站部署以实现发布，后端使用MongoDB数据库存储。

当前项目已经实现了功能模块（从上到下）：
1. 大标题
2. 名人名言展示栏
3. 任务总结状态栏
4. 本日任务输入框
5. 本日已完成任务栏
6. 任务查询

## 需求

我希望添加一个新功能[历史记录导入]，添加在已有功能模块的下面。功能如下：

1. 输入是.docx文件，里面每一行是一条数据
2. 写一个输入转换脚本，读取docx输入文件，每一行数据有4种可能的类型：
    1. 日期：形式类似“20260101”或者“20260101周一”
    2. 已完成任务：已勾选的框选
    3. 未完成任务：未勾选的框选
    4. 其他需要被过滤掉的数据
    将这些数据分类后按照【数据保留规则】进行格式转换
3. 将格式转换后的数据导入数据库

## 实现效果

1. 有一个输入文件的框和确定按钮
2. 输出运行转换脚本后的结果，包括：总数据行数，已完成导入的有效数据行数，被过滤的数据行数，导入的未完成任务数，导入的已完成任务数

## 具体案例

1. 读取docx的代码可参考如下代码：
"
# -*- coding: utf-8 -*-
"""提取 docx 文本，包含列表的框选符号（☐/☑）"""
import zipfile
import xml.etree.ElementTree as ET

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

def get_num_symbols(docx_path):
    """从 numbering.xml 获取 numId -> 符号(☐/☑) 的映射"""
    symbols = {}
    abstract_symbols = {}
    try:
        with zipfile.ZipFile(docx_path, 'r') as z:
            if 'word/numbering.xml' not in z.namelist():
                return symbols
            xml_bytes = z.read('word/numbering.xml')
    except Exception:
        return symbols

    root = ET.fromstring(xml_bytes)
    for anum in root.findall('.//w:abstractNum', NS):
        aid = anum.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}abstractNumId')
        lvl = anum.find('.//w:lvl[@w:ilvl="0"]', NS)
        if lvl is not None:
            lvl_text = lvl.find('w:lvlText', NS)
            if lvl_text is not None:
                sym = lvl_text.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val', '')
                if aid:
                    abstract_symbols[aid] = sym

    for num in root.findall('.//w:num', NS):
        nid = num.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}numId')
        aid_el = num.find('w:abstractNumId', NS)
        if nid and aid_el is not None:
            aid = aid_el.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val')
            if aid and aid in abstract_symbols:
                symbols[nid] = abstract_symbols[aid]
    return symbols

def extract_paragraphs(docx_path):
    """提取段落文本及对应的框选符号"""
    symbols = get_num_symbols(docx_path)
    try:
        with zipfile.ZipFile(docx_path, 'r') as z:
            xml_bytes = z.read('word/document.xml')
    except Exception as e:
        print('Error:', e)
        return []

    root = ET.fromstring(xml_bytes)
    result = []
    for p in root.findall('.//w:p', NS):
        num_pr = p.find('.//w:numPr', NS)
        num_id = None
        if num_pr is not None:
            nid_el = num_pr.find('w:numId', NS)
            if nid_el is not None:
                num_id = nid_el.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val')

        texts = []
        for t in p.findall('.//w:t', NS):
            if t.text:
                texts.append(t.text)
        text = ''.join(texts).strip()

        sym = ''
        if num_id and num_id in symbols:
            sym = symbols[num_id] + ' '

        line = (sym + text).strip()
        if line:
            result.append(line)
    return result

if __name__ == '__main__':
    for line in extract_paragraphs('2026三件事dairy.docx'):
        print(line)
"

2. 读取的输入文件为
"
2026年
20260110周六
☐ 学习大模型课程（吴学长）
☑ 取快递
☑ 洗澡
20260111
☑ 写了开题报告初初初版给师兄
☑ 休息！少想点
"

3. 经过转换脚本处理后的数据为
"
学习大模型课程（吴学长）2026-01-10 未完成
取快递 2026-01-10 已完成
洗澡 2026-01-10 已完成
写了开题报告初初初版给师兄 2026-01-11 已完成
休息！少想点 2026-01-11 已完成
"

4. 将转换后的数据再次转换为符合数据库的形式，并存储。输出到页面的内容为：
”
总数据行数=8
有效数据行数=7
导入的未完成任务数=1
导入的已完成任务数=4
“

## 数据保留规则

- 所有任务都会写入数据库，除非用户点击「删除」
- 历史任务通过任务查询功能可查看
- 每年 1 月 1 日，年度统计会重置为 0，但历史任务仍保留在数据库中
- 所有的数据只保留【日期】、【任务内容】和【任务状态】，日期不区分创建日期和完成日期

## 注意事项

1. 这个架构并不完整，因此如果有任何不明确的地方询问我，不要自己决定。
2. 运行这个项目，验证整个项目的可行性与完整性，如果出现报错自行修改，成功运行后再结束任务。


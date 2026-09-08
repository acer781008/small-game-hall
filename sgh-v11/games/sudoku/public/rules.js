window.SUDOKU_RULES={
'標準數獨':{title:'標準數獨',html:'<b>目標：</b>把所有空格填完。<br>9×9 使用 1～9；12×12 使用 1～12。<br><b>規則：</b>每一橫列、每一直行、每一個宮內，數字都不能重複。'},
'對角線數獨':{title:'對角線數獨',html:'先遵守標準數獨全部規則。<br><b>再增加：</b>左上→右下、右上→左下兩條大對角線上的數字也不能重複。<br>畫面會以淡色標示兩條對角線。'},
'殺手數獨':{title:'殺手數獨',html:'先遵守標準數獨規則。盤面會出現框起來的「籠子」。<br><b>籠子左上角的數字＝籠內所有格子的加總。</b><br>例如兩格標示 10，兩格數字加起來就必須是 10；同一籠內數字也不可重複。'},
'不連續數獨':{title:'不連續數獨',html:'先遵守標準數獨規則。<br><b>上下左右直接相鄰的兩格，不可以是連續數字。</b><br>例如 4 和 5、7 和 8 不能相鄰；4 和 6 可以。斜著相鄰不算。'},
'不規則數獨':{title:'不規則數獨',html:'橫列、直行都不能重複。<br>原本方正的宮改成不規則區域；<b>每個粗線框起來的區域內數字也不能重複。</b><br>把每個不規則區域當成普通數獨的宮即可。'},
'彩色數獨':{title:'彩色數獨',html:'先遵守標準數獨規則。<br>盤面會有額外的彩色格子群組。<br><b>同一顏色的格子＝數字不能重複。</b>看到相同顏色，就把它們當成額外的一組限制。'}
};

window.SUDOKU_RULE_SUMMARIES={
'標準數獨':'每一橫列、每一直行、每一個宮內的數字都不能重複。',
'對角線數獨':'遵守標準數獨規則，另外兩條主對角線上的數字也不能重複。',
'殺手數獨':'遵守標準數獨規則；每個籠內數字加總須等於標示數字，同一籠內也不可重複。',
'不連續數獨':'遵守標準數獨規則；上下左右相鄰的兩格不可是連續數字。',
'不規則數獨':'橫列、直行不可重複；每個不規則粗線區域內的數字也不能重複。',
'彩色數獨':'遵守標準數獨規則；同一顏色群組內的數字也不能重複。'
};
window.getRuleSummary=function(variant){return window.SUDOKU_RULE_SUMMARIES[variant]||window.SUDOKU_RULE_SUMMARIES['標準數獨'];};
window.openRule=function(variant){const r=window.SUDOKU_RULES[variant]||window.SUDOKU_RULES['標準數獨'];document.querySelector('#ruleTitle').textContent='📖 '+r.title+' 規則';document.querySelector('#ruleBody').innerHTML=r.html+'<hr><b>完成條件：</b>所有空格填入正確答案後才算完成。查看規則不會暫停計時。';document.querySelector('#ruleModal').classList.add('show')}
window.closeRule=function(){document.querySelector('#ruleModal').classList.remove('show')}

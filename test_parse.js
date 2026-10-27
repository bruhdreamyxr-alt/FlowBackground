var fso = new ActiveXObject('Scripting.FileSystemObject');
var file = fso.OpenTextFile('C:\\Users\\antho\\AppData\\Roaming\\Adobe\\CEP\\extensions\\com.antho.flowbg.panel\\js\\panel.js', 1);
var code = file.ReadAll();
file.Close();
var window = { __adobe_cep__: { getSystemPath: function(){ return ''; } }, addEventListener: function(){}, location: { reload: function(){} } };
var document = { getElementById: function(){ return null; }, addEventListener: function(){}, body: { style: {} }, readyState: 'complete' };
try { eval(code); WScript.Echo('OK'); }
catch (e) { WScript.Echo('ERROR: ' + e.message); }
﻿/*!
 * artTemplate - Template Engine
 * https://github.com/aui/artTemplate
 * Released under the MIT, BSD, and GPL Licenses
 * Email: 1987.tangbin@gmail.com
 */
 

/**
 * 模板引擎路由函数
 * 根据 content 参数类型执行 render 或者 define 方法
 * @name    template
 * @param   {String}            模板ID (可选)
 * @param   {Object, String}    数据或者模板
 * @return  {String, Function}  渲染好的HTML字符串或者渲染方法
 */
var template = function (id, content) {
    return template[
        typeof content === 'object' ? 'render' : 'define'
    ].apply(template, arguments);
};




(function (exports, global) {


"use strict";
exports.version = '1.0';
exports.openTag = '<%';
exports.closeTag = '%>';
exports.statement = null;



/**
 * 渲染模板
 * @name    template.render
 * @param   {String}    模板ID
 * @param   {Object}    数据
 * @return  {String}    渲染好的HTML字符串
 */
exports.render = function (id, data) {

    var cache = _getCache(id);
    
    if (cache === undefined) {

        return _debug({
            id: id,
            name: 'Render Error',
            message: 'Not Cache'
        });
        
    }
    
    return cache(data); 
};



/**
 * 定义模板
 * @name    template.define
 * @param   {String}    模板ID (可选)
 * @param   {String}    模板
 * @return  {Function}  渲染方法
 */
exports.define = function (id, source) {
    
    var debug = arguments[2];
    
    
    // 忽略id参数
    if (typeof source !== 'string') {
        debug = source;
        source = id;
        id = null;
    }  

    
    try {
        
        var cache = exports.compiled(source, debug);
        
    } catch (e) {
    
        e.id = id;
        e.name = 'Syntax Error';
        return _debug(e);
        
    }
    
    
    var render = function (data) {           
        
        try {
            
            return cache.call(data, data, _methods); 
            
        } catch (e) {
            
            // 遇错则开启调试模式重新编译并运行
            if (!debug) {
                return exports.define(id, source, true)(data);
            }
			
            e.id = id || source;
            e.name = 'Render Error';
            e.source = source;
            
            return _debug(e);
            
        };
        
    };
    
    if (id) {
        _cache[id] = render;
    }
    
    return render;

};



/**
 * 模板编译器
 * @name    template.compiled
 * @param   {String}    模板
 * @param   {Boolean}   是否开启调试 (默认true)
 * @return  {Function}  编译好的函数 (默认false)
 * @inner
 */
exports.compiled = function (source, debug) {

    var openTag = exports.openTag;
    var closeTag = exports.closeTag;
    var statement = exports.statement;

    
    var code = source;
    var tempCode = '';
    var line = 1;
    var outKey = {};
    var uniq = {$out:true,$line:true};
    
    var variables = debug ? "var $line=0," : "var ";
    
    var replaces = _isNewEngine
    ? ["$out='';", "$out+=", ";", "$out"]
    : ["$out=[];", "$out.push(", ");", "$out.join('')"];
    
    var include = "function(id,data){"
    +     "if(data===undefined){data=$data}"
    +     "return $methods.$render(id,data)"
    + "}";
    
    
    
    // html与逻辑语法分离
    _forEach.call(code.split(openTag), function (code, i) {
        code = code.split(closeTag);
        
        var $0 = code[0];
        var $1 = code[1];
        
        // code: [html]
        if (code.length === 1) {
            
            tempCode += html($0);
         
        // code: [logic, html]
        } else {
            
            tempCode += logic($0);
            
            if ($1) {
                tempCode += html($1);
            }
        }
        

    });
    
    
    
    code = tempCode;
    
    
    // 调试语句
    if (debug) {
        code = 'try{' + code + '}catch(e){'
        +       'e.line=$line;'
        +       'throw e'
        + '}';
    }
    
    
    code = variables + replaces[0] + code + 'return ' + replaces[3];
    
    
    try {

        return new Function('$data', '$methods', code);
        
    } catch (e) {
        e.temp = 'function anonymous($data,$methods) {' + code + '}';
        throw e;
    };
    
    
    
    // 处理 HTML 语句
    function html (code) {
        
        // 记录行号
        line += code.split(/\n/).length - 1;
        
        code = code
        // 单双引号与反斜杠转义
        .replace(/('|"|\\)/g, '\\$1')
        // 换行符转义(windows + linux)
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
        
        code = replaces[1] + "'" + code + "'" + replaces[2];
        
        return code + '\n';
    };
    
    
    // 处理逻辑语句
    function logic (code) {

        var thisLine = line;
       
        if (statement) {
        
             // 自定义语法转换器
            code = statement(code);
            
        } else if (debug) {
        
            // 记录行号
            code = code.replace(/\n/g, function () {
                line ++;
                return '$line=' + line +  ';';
            });
            
        }
        
        
        // 输出语句
        if (code.indexOf('=') === 0) {
            
            code = replaces[1]
            + (_isNewEngine ? '$getValue(' : '')
            + code.substring(1).replace(/^\s+|([;]\s*)$/, '')
            + (_isNewEngine ? ')' : '')
            + replaces[2];

        }
        
        if (debug) {
            code = '$line=' + thisLine + ';' + code;
        }
		
        getKey(code);
        
        return code + '\n';
    };
    
    
    // 提取模板中的变量名
    function getKey (code) {
        
        // 过滤注释、字符串、方法名
        code = code.replace(/\/\*.*?\*\/|'[^']*'|"[^"]*"|\.[\$\w]+/g, '');
		
        // 分词
        _forEach.call(code.split(/[^\$\w\d]+/), function (name) {
         
            // 沙箱规范：禁止通过套嵌函数的 this 关键字获取全局权限
            if (/^(this|\$methods)$/.test(name)) {
                throw {
                    message: 'Prohibit the use of the "' + name +'"'
                };
            }
			
            // 过滤关键字与数字
            if (!name || _keyWordsMap[name] || /^\d/.test(name)) {
                return;
            }
            
            // 除重
            if (!uniq[name]) {
                setValue(name);
                uniq[name] = true;
            }
            
        });
        
    };
    
    
    // 声明模板变量
    // 赋值优先级: 内置特权方法(include) > 公用模板方法 > 数据
    function setValue (name) {  
        var value;

        if (name === 'include') {
        
            value = include;
            
        } else if (_methods[name]) {
            
            value = '$methods.' + name;
            
        } else {
        
            value = '$data.' + name;
			
        }
        
        variables += name + '=' + value + ',';
    };
    
	
};



/**
 * 添加模板公用方法
 * @name    template.method
 * @param   {String}    名称
 * @param   {Function}  方法
 */
exports.method = function (name, method) {
    if (method === undefined) {
        return _methods[name];
    } else {
        _methods[name] = method;
    }
};



var _cache = {};
var _methods = {};
var _isNewEngine = ''.trim;
var _isServer = _isNewEngine && !global.document;



// 获取模板缓存
var _getCache = function (id) {
    var cache = _cache[id];
    
    // 查找页面内嵌模板并编译
    if (cache === undefined && !_isServer) {
        var elem = document.getElementById(id);
        
        if (elem) {
            exports.define(id, elem.value || elem.innerHTML);
        }
        
        return _cache[id];
    }
    
    return cache;
};



// 模板调试器
var _debug = function (e) {

    var content = '[template]:\n' + e.id
    + '\n\n[name]:\n' + e.name;
    
    if (e.message) {
        content += '\n\n[message]:\n' + e.message;
    }
    
    if (e.line) {
        content += '\n\n[line]:\n' + e.line;
        content += '\n\n[source]:\n' + e.source.split(/\n/)[e.line - 1];
    }
    
    if (e.temp) {
        content += '\n\n[temp]:\n' + e.temp;
    }
    
    if (global.console) {
        console.error(content);
    }
    
    return '{Template Error}';
};



// 数组迭代方法
var _forEach =  Array.prototype.forEach || function (block, thisObject) {
    var len = this.length >>> 0;
    
    for (var i = 0; i < len; i++) {
        if (i in this) {
            block.call(thisObject, this[i], i, this);
        }
    }
    
};



// javascript 关键字表
var _keyWordsMap = {};
_forEach.call((

    // 关键字
    'break,case,catch,continue,debugger,default,delete,do,else,false,finally,for,function,if'
    + ',in,instanceof,new,null,return,switch,this,throw,true,try,typeof,var,void,while,with'
    
    // 保留字
    + ',abstract,boolean,byte,char,class,const,double,enum,export,extends,final,float,goto'
    + ',implements,import,int,interface,long,native,package,private,protected,public,short'
    + ',static,super,synchronized,throws,transient,volatile'
    
    // ECMA 5 - use strict
    + ',arguments,let,yield'
    
).split(','), function (key) {
    _keyWordsMap[key] = true;
});



// 模板私有方法
exports.method('$forEach', _forEach);
exports.method('$render', exports.render);
exports.method('$getValue', function (value) {
    return value === undefined ? '' : value;
});



})(template, this);


if (typeof module !== 'undefined' && module.exports) {
    module.exports = template;    
}
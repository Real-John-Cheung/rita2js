$(document).ready(function () {

    let defaultValue = "", consoleContents = [];
    let _console = reassignConsole();

    CodeMirror.defineSimpleMode("RiScript", {
        start: [
            // RiScript
            { regex: /\$\w+/g, token: ["keyword"] },
            // vars -> color label 'keyword'
            { regex: /\((.*\|)+.*\)/g, token: ["string"] },
            // choices -> color label 'string'
            { regex: /(\.[\w]+\(\))/g, token: ["number"] },
            // transforms -> color label 'number'
        ],
        comment: [
            { regex: /.*?\*\//, token: "comment", next: "start" },
            { regex: /.*/, token: "comment" }
        ],
        meta: {
            dontIndentStates: ["comment"],
            lineComment: "//"
        }
    });

    let editor = CodeMirror.fromTextArea($('#inputArea')[0], {
        lineNumbers: true,
        mode: 'RiScript',
        extraKeys: {
            "Ctrl-Enter": function () {
                runCode(); // wins
            }, "Cmd-Enter": function () {
                runCode(); // mac
            }
        },
    });
    editor.setSize("100%", "100%");

    let errorLine, doc = editor.getDoc();

    editor.on('change', function () {
        removeHighlight(errorLine);
    });

    // resizing
    $(".resizer.vertical").mousedown(function (e) {
        e.preventDefault();
        $("body").mousemove(function (m) {
            let x = m.pageX;
            let h = $("body").width() - m.pageX;
            $("#output").css({ width: x });
            $("#console").css({ width: h });
        });
    });
    $(".resizer.horizontal").mousedown(function (e) {
        e.preventDefault();
        $("body").mousemove(function (m) {
            let h = $("body").height() - m.pageY;
            $(".output-button-wrapper").css({ height: h })
        });
        let h = $("#output").height() - 30
        $(".content-wrapper").css({ height: h });
    });
    $("body").mouseup(function (e) {
        $(this).unbind("mousemove");
    });

    // buttons
    $("#clear").click(function (e) {
        e.preventDefault();
        editor.clearHistory();
        editor.setValue(defaultValue);
        $("#inputArea").val(defaultValue);
    });
    $("#run").click(function (e) {
        e.preventDefault();
        runCode();
    });
    $("#save").click(function (e) {
        e.preventDefault();
        saveCode();
    });
    $("#clearConsole").click(function (e) {
        e.preventDefault();
        $("#console .content").empty();
        consoleContents.length = 0;
    });
    $("#clearOutput").click(function (e) {
        e.preventDefault();
        $("#output .content").empty();
        consoleContents.length = 0;
    });

    // helpers
    function runCode() {
        let rs = doc.getValue(), res = tryCode(rs);
        $(".content-wrapper").css({ height: $("#output").height() - 30 });
        if (res.length) $("#output .content").append("<p class='output-content'>" + res + " </p>");
        $("#console .content").empty();
        writeToConsolePanel();
    }

    function writeToConsolePanel() {
        consoleContents.forEach(cc => {
            let msg = cc.content;
            if (cc.type !== 'log') {
                msg = msg.replace(/'/g, '"').replace(/PARSER: /, '');
            }
            $("#console .content").append(
                "<p class='output-content-" + cc.type + "'>" + msg + " </p>");
        });
    }

    function tryCode(string) {
        try {
            return RiTa.evaluate(string);
        } catch (e) {
            //console.error(e);
            let string = [].slice.call(e.stack).join('');
            if (string.includes("Parser failed at line")) {
                let arr = string.split(' ');
                let lineNo = arr[arr.indexOf("line") + 1].split(':')[0];
                highlightError(lineNo - 1);
                console.error(e.message);
            } else {
                console.error(e.stack);
            }
        }
        return '';
    }

    function saveCode() {
        //via https://stackoverflow.com/a/30832210
        let data = doc.getValue();
        let fileName = $("#title").val() + '.rs';
        let b = new Blob([data], { type: 'text' });
        let a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
        }, 0);
    }

    function highlightError(lineNo) {
        doc.addLineClass(lineNo, "background", "highLightedError");
        errorLine = lineNo;
    }

    function removeHighlight(lineNo) {
        if (lineNo) {
            doc.removeLineClass(lineNo, "background", "highLightedError");
            errorLine = undefined;
        }
    }

    // rewrite console funtions to get the content
    function reassignConsole() {
        let _console = console;
        if (console) {
            _console = {
                log: console.log,
                info: console.info,
                debug: console.debug,
                warn: console.warn,
                error: console.error,
            };
            console.log = function () {
                consoleContents.push({ type: 'log', content: Array.prototype.join.call(arguments, '') });
                _console.log.apply(console, arguments);
            };
            console.info = function () {
                consoleContents.push({ type: 'info', content: Array.prototype.join.call(arguments, '') });
                _console.info.apply(console, arguments);
            };
            console.debug = function () {
                consoleContents.push({ type: 'debug', content: Array.prototype.join.call(arguments, '') });
                _console.debug.apply(console, arguments);
            };
            console.warn = function () {
                consoleContents.push({ type: 'warn', content: Array.prototype.join.call(arguments, '') });
                _console.warn.apply(console, arguments);
            };
            console.error = function () {
                consoleContents.push({ type: 'error', content: Array.prototype.join.call(arguments, 'XXX') });
                _console.error.apply(console, arguments);
            };
        } else {
            consoleContents.push('** console not available **');
        }
        return _console;
    }
});


package com.singpath.tools;

import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import java.io.IOException;
import java.io.Writer;
import java.util.Arrays;

public class Compiler {
    private MemoryClassLoader cl;

    public Compiler() {
        this.cl = new MemoryClassLoader();
    }

    public Class<?> find(String name) throws ClassNotFoundException {
        return this.cl.findClass(name);
    }

    public boolean compile(Writer out, StringJavaSource... sources) {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        StandardJavaFileManager sdfm = compiler.getStandardFileManager(null, null, null);
        MemoryJavaFileManager fileManager = new MemoryJavaFileManager(sdfm, this.cl);


        Iterable<? extends JavaFileObject> sourceList = Arrays.asList(sources);
        boolean success = compiler.getTask(out, fileManager, null, null, null, sourceList).call();

        try {
            fileManager.close();
        } catch (IOException e) {
        }

        return success;
    }
}

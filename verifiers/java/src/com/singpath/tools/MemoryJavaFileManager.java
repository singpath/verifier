package com.singpath.tools;


import javax.tools.FileObject;
import javax.tools.ForwardingJavaFileManager;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import java.io.IOException;

public class MemoryJavaFileManager extends ForwardingJavaFileManager<StandardJavaFileManager> {
    private MemoryClassLoader xcl;

    public MemoryJavaFileManager(StandardJavaFileManager sjfm, MemoryClassLoader classLoader) {
        super(sjfm);
        this.xcl = classLoader;
    }

    public JavaFileObject getJavaFileForOutput(Location location, String name, JavaFileObject.Kind kind, FileObject sibling) throws IOException {
        ByteCodeClass mbc = new ByteCodeClass(name);
        xcl.addClass(name, mbc);
        return mbc;
    }

    public ClassLoader getClassLoader(Location location) {
        return xcl;
    }
}

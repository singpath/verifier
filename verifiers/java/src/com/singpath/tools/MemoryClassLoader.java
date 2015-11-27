package com.singpath.tools;


import java.util.HashMap;
import java.util.Map;


public class MemoryClassLoader extends ClassLoader {
    private Map<String, ByteCodeClass> m = new HashMap<String, ByteCodeClass>();

    public Class<?> findClass(String name) throws ClassNotFoundException {
        ByteCodeClass mbc = m.get(name);
        if (mbc == null) {
            mbc = m.get(name.replace(".", "/"));
            if (mbc == null) {
                return super.findClass(name);
            }
        }
        return defineClass(name, mbc.getBytes(), 0, mbc.getBytes().length);
    }

    public void addClass(String name, ByteCodeClass mbc) {
        m.put(name, mbc);
    }
}
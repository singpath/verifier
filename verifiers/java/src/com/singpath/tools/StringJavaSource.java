package com.singpath.tools;


import javax.tools.SimpleJavaFileObject;
import java.net.URI;

public class StringJavaSource extends SimpleJavaFileObject {
    final String code;

    public StringJavaSource(String name, String code) {
        super(URI.create("string:///" + name.replace('.', '/') + Kind.SOURCE.extension), Kind.SOURCE);
        this.code = code;
    }

    @Override
    public CharSequence getCharContent(boolean ignoreEncodingErrors) {
        return code;
    }
}

package com.singpath.server;


public class OnShutDown implements Runnable {

    private ShutDown inst;

    public OnShutDown(ShutDown inst) {
        this.inst = inst;
    }

    @Override
    public void run() {
        this.inst.shutdown();
    }
}

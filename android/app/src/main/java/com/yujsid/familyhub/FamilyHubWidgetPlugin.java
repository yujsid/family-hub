package com.yujsid.familyhub;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FamilyHubWidget")
public class FamilyHubWidgetPlugin extends Plugin {
    @PluginMethod
    public void setSnapshot(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.isEmpty()) {
            call.reject("일정 데이터가 없습니다.");
            return;
        }
        WidgetStore.saveSnapshot(getContext(), json);
        TodayWidgetProvider.refreshAll(getContext());
        call.resolve();
    }
}

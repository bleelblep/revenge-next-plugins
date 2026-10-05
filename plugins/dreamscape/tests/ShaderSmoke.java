import android.graphics.RuntimeShader;
import android.graphics.RenderEffect;
import java.nio.file.Files;
import java.nio.file.Path;

/** Run with app_process on Android 13+ to compile the actual shipped AGSL strings. */
public class ShaderSmoke {
    public static void main(String[] args) throws Exception {
        for (String path : args) {
            String source = Files.readString(Path.of(path));
            int start = source.indexOf("\"\"\"") + 3;
            int end = source.indexOf("\"\"\"", start);
            RuntimeShader shader = new RuntimeShader(source.substring(start, end));
            if (source.contains("uniform shader img;")) {
                shader.setFloatUniform("size", 1260f, 2800f);
                shader.setFloatUniform("density", 3f);
                shader.setFloatUniform("time", 1f);
                shader.setFloatUniform("tint", .5f, .8f, 1f);
                shader.setFloatUniform("amount", .7f);
                for (int world = 0; world < 4; world++) {
                    shader.setFloatUniform("world", (float) world);
                    RenderEffect.createRuntimeShaderEffect(shader, "img");
                }
            }
            System.out.println("PASS " + path);
        }
    }
}

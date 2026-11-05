# Amigo Secreto

Site para as cinco participantes MariMari, Jujubas, Isinha, Aninha e Nick. A organizadora gera cinco senhas aleatórias no painel protegido e entrega cada senha em particular. Cada participante entra com seu nome e senha; o sorteio acontece automaticamente somente depois que as cinco confirmarem presença.

## Rodar localmente

1. Instale o Node.js 20 ou superior e execute `npm install`.
2. Copie `.env.example` para `.env` e substitua `ADMIN_KEY` por uma chave aleatória sua, com pelo menos 16 caracteres.
3. Execute `npm start` e abra `http://localhost:3000`.
4. Abra **Área da organizadora**, informe a chave e escolha **Ver ou gerar senhas**. Copie cada senha e envie em particular à pessoa certa.
5. Cada participante escolhe seu nome, informa a senha recebida e toca em **Confirmar presença**.

## Publicar no Render

1. Envie as alterações ao GitHub. Não envie `.env`.
2. No Render, abra o serviço → **Environment** e adicione `ADMIN_KEY` com uma chave secreta aleatória de pelo menos 16 caracteres.
3. Salve e faça o deploy. O `render.yaml` já configura o restante, incluindo o disco persistente em `/var/data`.
4. Abra o endereço do site, entre na área da organizadora com a mesma chave e gere as senhas. Envie cada uma em particular.

O disco persistente é necessário para manter senhas e resultados após reinícios; ele pode exigir um plano pago no Render. Não remova nem recrie o disco após gerar as senhas.

## Privacidade e acesso

O painel protegido não mostra resultados. Cada sessão de participante recebe somente o próprio resultado, e o sorteio não aparece antes dos cinco acessos. Para que a organizadora possa reenviar as senhas manualmente, elas ficam guardadas no arquivo privado de dados do servidor e podem ser consultadas com `ADMIN_KEY`. Como a organizadora terá todas as senhas, ela também poderia entrar nas contas das participantes; envie cada senha em particular e não compartilhe a chave de organização.

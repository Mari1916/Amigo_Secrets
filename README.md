# Amigo Secreto

Site para MariMari, Jujubas, Isinha, Aninha e Nick. Cada pessoa informa nome e e-mail. O navegador gera uma senha aleatória, envia-a ao site para armazenamento como hash e usa a biblioteca `@emailjs/browser` para enviar a senha por e-mail. Quando as cinco se cadastrarem, o sorteio acontece automaticamente e cada pessoa pode ver apenas o próprio resultado.

A biblioteca EmailJS é carregada no navegador pelo jsDelivr; o servidor Node não usa SMTP.

## Conectar o Gmail ao EmailJS

1. Crie uma conta em [emailjs.com](https://www.emailjs.com/) e confirme seu endereço.
2. Em **Email Services**, adicione o Gmail e autorize o EmailJS pela janela oficial do Google. Não precisa fornecer sua senha do Gmail nem gerar senha de app.
3. Em **Email Templates**, crie um template. Configure o destinatário como `{{to_email}}`, o assunto como `Sua senha do Amigo Secreto`, e a mensagem, por exemplo:

   ```text
   Oi, {{to_name}}!

   Sua senha para acessar o Amigo Secreto é:
   {{password}}

   Quando as cinco participantes se cadastrarem, acesse {{site_url}} e entre com seu e-mail e essa senha.
   Não compartilhe sua senha.
   ```

4. Copie o **Service ID**, o **Template ID** e a **Public Key** da sua conta EmailJS.
5. Em **Security** no EmailJS, restrinja os domínios permitidos ao domínio do seu site no Render depois de criá-lo. A public key é pública por natureza; nunca coloque a private key no site.

## Rodar localmente

1. Instale o Node.js 20 ou superior e execute `npm install`.
2. Copie `.env.example` para `.env` e preencha `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID` e `EMAILJS_PUBLIC_KEY`.
3. Execute `npm start` e abra `http://localhost:3000`. Se o EmailJS bloquear o domínio local, adicione `localhost` à lista de domínios permitidos enquanto testa.

## Publicar no Render

1. Envie o projeto para o GitHub. Nunca inclua `.env`.
2. No Render, entre com GitHub, clique **New +** → **Blueprint** e selecione o repositório.
3. Informe os três valores pedidos: `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID` e `EMAILJS_PUBLIC_KEY`.
4. Quando o deploy terminar, copie o domínio `.onrender.com`, adicione esse domínio aos permitidos na segurança do EmailJS e configure as variáveis se necessário.
5. Compartilhe o link com as cinco participantes. Elas recebem a senha por e-mail; se houver erro de envio, a página mostra uma opção para tentar novamente.

O serviço usa um disco persistente do Render em `/var/data`, necessário para preservar cadastros e resultados. O disco requer um plano pago. Não remova nem recrie o disco após o início das inscrições.

## Privacidade

As senhas são geradas pelo navegador e enviadas diretamente ao EmailJS; o servidor armazena somente os hashes. As chaves de EmailJS usadas pelo navegador (Service ID, Template ID e Public Key) não são segredos. A Private Key do EmailJS não é necessária nem deve ser publicada. Quem administra a hospedagem ainda pode tecnicamente acessar os dados armazenados.

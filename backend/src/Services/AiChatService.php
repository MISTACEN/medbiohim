<?php
declare(strict_types=1);

namespace Medbiohim\Services;

use Medbiohim\Database\Connection;
use Medbiohim\Support\LlmGateway;
use PDO;

final class AiChatService
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Connection::pdo();
    }

    public function providers(): array
    {
        return LlmGateway::chatProvidersStatus();
    }

    public function listConversations(string $userId): array
    {
        $q=$this->db->prepare("select id,title,provider,model,subject_slug,created_at,updated_at from ai_conversations where user_id=:u order by updated_at desc limit 100");
        $q->execute([':u'=>$userId]);
        return $q->fetchAll();
    }

    public function getConversation(string $userId,string $id): array
    {
        $q=$this->db->prepare("select id,title,provider,model,subject_slug,metadata,created_at,updated_at from ai_conversations where id=:id and user_id=:u");
        $q->execute([':id'=>$id,':u'=>$userId]);
        $conversation=$q->fetch();
        if(!$conversation) throw new \RuntimeException('AI conversation not found');
        $m=$this->db->prepare("select id,role,content,provider,model,metadata,created_at from ai_messages where conversation_id=:c and user_id=:u order by created_at asc");
        $m->execute([':c'=>$id,':u'=>$userId]);
        return ['conversation'=>$conversation,'messages'=>$m->fetchAll()];
    }

    public function createConversation(string $userId,?string $title=null,string $provider='auto',?string $subjectSlug=null): array
    {
        $provider=$this->normalizeProvider($provider);
        $title=$this->cleanTitle($title ?: 'Новый чат');
        $q=$this->db->prepare("insert into ai_conversations(user_id,title,provider,subject_slug) values(:u,:t,:p,:s) returning id,title,provider,model,subject_slug,created_at,updated_at");
        $q->execute([':u'=>$userId,':t'=>$title,':p'=>$provider,':s=>$subjectSlug]);
        return (array)$q->fetch();
    }

    public function deleteConversation(string $userId,string $id): void
    {
        $q=$this->db->prepare("delete from ai_conversations where id=:id and user_id=:u");
        $q->execute([':id'=>$id,':u'=>$userId]);
    }

    public function send(string $userId,string $conversationId,string $content,?string $provider=null,?string $subjectSlug=null): array
    {
        $content=trim($content);
        if($content==='') throw new \InvalidArgumentException('Сообщение не может быть пустым');
        if(mb_strlen($content)>12000) throw new \InvalidArgumentException('Сообщение слишком длинное');

        $this->db->beginTransaction();
        try {
            $q=$this->db->prepare("select id,title,provider,model,subject_slug from ai_conversations where id=:id and user_id=:u for update");
            $q->execute([':id'=>$conversationId,':u'=>$userId]);
            $conversation=$q->fetch();
            if(!$conversation) throw new \RuntimeException('AI conversation not found');

            $chosen=$this->normalizeProvider($provider ?: (string)$conversation['provider']);
            if($subjectSlug!==null) $conversation['subject_slug']=$subjectSlug;

            $ins=$this->db->prepare("insert into ai_messages(conversation_id,user_id,role,content) values(:c,:u,'user',:x) returning id,role,content,created_at");
            $ins->execute([':c'=>$conversationId,':u'=>$userId,':x'=>$content]);
            $userMessage=$ins->fetch();

            $hist=$this->db->prepare("select role,content from ai_messages where conversation_id=:c and user_id=:u order by created_at desc limit 40");
            $hist->execute([':c'=>$conversationId,':u'=>$userId]);
            $rows=array_reverse($hist->fetchAll());
            $messages=[];
            $system='Ты — AI-тьютор платформы «Медбиохим». Отвечай по-русски, понятно студенту медицинского вуза. Объясняй последовательно, не выдумывай факты. Если вопрос учебный — выделяй ключевые понятия, механизм и короткий вывод.';
            if(!empty($conversation['subject_slug'])) $system.=' Текущий предмет: '.(string)$conversation['subject_slug'].'.';
            $messages[]=['role'=>'system','content'=>$system];
            foreach($rows as $row) $messages[]=['role'=>(string)$row['role'],'content'=>(string)$row['content']];

            $out=LlmGateway::chatProvider($chosen,$messages,0.35);
            $assistant=$this->db->prepare("insert into ai_messages(conversation_id,user_id,role,content,provider,model,metadata) values(:c,:u,'assistant',:x,:p,:m,:meta) returning id,role,content,provider,model,metadata,created_at");
            $assistant->execute([
                ':c'=>$conversationId,':u'=>$userId,':x'=>$out['text'],':p'=>$out['provider'],':m'=>$out['model'],
                ':meta'=>json_encode(['mode'=>$out['mode']??'api'],JSON_UNESCAPED_UNICODE)
            ]);
            $assistantMessage=$assistant->fetch();

            $newTitle=(string)$conversation['title'];
            if($newTitle==='Новый чат') $newTitle=$this->cleanTitle($content);
            $upd=$this->db->prepare("update ai_conversations set title=:t,provider=:p,model=:m,subject_slug=coalesce(:s,subject_slug),updated_at=now() where id=:id and user_id=:u");
            $upd->execute([':t'=>$newTitle,':p'=>$out['provider'],':m'=>$out['model'],':s'=>$subjectSlug,':id'=>$conversationId,':u'=>$userId]);
            $this->db->commit();
            return ['conversation'=>array_merge($conversation,['title'=>$newTitle,'provider'=>$out['provider'],'model'=>$out['model']]),'user_message'=>$userMessage,'assistant_message'=>$assistantMessage];
        } catch(\Throwable $e) {
            if($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    private function normalizeProvider(string $provider): string
    {
        $provider=strtolower(trim($provider));
        return in_array($provider,['auto','gigachat','gemini'],true) ? $provider : 'auto';
    }

    private function cleanTitle(string $title): string
    {
        $title=preg_replace('/\\s+/u',' ',trim($title)) ?: 'Новый чат';
        return mb_substr($title,0,80);
    }
}

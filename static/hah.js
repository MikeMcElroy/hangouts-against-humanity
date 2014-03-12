/* global gapi,angular */
'use strict';

function drawCardFromDeck(getJSONValue, setJSONValue, deckKey) {
  var get = getJSONValue.bind(null, deckKey),
      set = setJSONValue.bind(null, deckKey);

  return function(num) {
    var deck = get(),
        deckLen = deck.length,
        cards = [],
        number = num || 1;

    if(number < deckLen) {
      cards = deck.splice(0, number);
    } else {
      cards = deck;
      deck = [];
    }

    set(deck);
    return cards;
  };
}

angular.module('HangoutsAgainstHumanity', ['ngAnimate', 'ui.bootstrap'])
  .factory('submitDelta', ['$timeout', function($timeout) {
    var next_submit,
        d, r;
    return function(delta, remove) {
      if(!next_submit) {
        d = {};
        r = [];
        next_submit = $timeout(function() {
          gapi.hangout.data.submitDelta(d, r);
          next_submit = undefined;
        }, 20);
      }
      for (var i in delta) {
        d[i] = JSON.stringify(delta[i] || null);
      }
      for (var j in remove) {
        if(r.indexOf(remove[j]) === -1) {
          r.push(remove[j]);
        }
      }
    };
  }])
  .factory('setJSONValue', ['submitDelta', function(submitDelta) {
    return function(key, value) {
      var delta = {};
      delta[key] = value;
      submitDelta(delta);
      return value;
    };
  }])
  .constant('getJSONValue', function(key) { return JSON.parse(gapi.hangout.data.getValue(key) || null); })
  .constant('whiteCardKey', 'white_cards')
  .constant('blackCardKey', 'black_cards')
  .constant('activeBlackCardKey', 'active_black_card')
  .constant('currentReaderKey', 'current_reader')
  .constant('currentStateKey', 'current_state')
  .constant('scoreboardKey', 'scoreboard')
  .constant('listeningForSubmissionKey', 'listening')
  .constant('shuffle', function(array) {
    var i, j, swapped,
        arrLen = array.length;

    for (i = ((arrLen - 1) * 3); i >= 0; i--) {
      j = Math.floor(Math.random() * arrLen);
      swapped = array[i % arrLen];
      array[i % arrLen] = array[j];
      array[j] = swapped;
    }

    return array;
  })
  .factory('localParticipantId', function() {
    return gapi.hangout.getLocalParticipantId();
  })
  .factory('localParticipantCards', ['localParticipantId', function(localParticipantId) {
    return 'cards_' + localParticipantId;
  }])
  .factory('localParticipantNewCards', ['localParticipantId', function(localParticipantId) {
    return 'new_' + localParticipantId;
  }])
  .factory('drawWhiteCards', ['getJSONValue', 'setJSONValue', 'whiteCardKey', drawCardFromDeck])
  .factory('drawBlackCards', ['getJSONValue', 'setJSONValue', 'blackCardKey', drawCardFromDeck])
  .factory('drawNewQuestion', ['drawBlackCards', 'setJSONValue', 'activeBlackCardKey', function(drawBlackCards, setJSONValue, activeBlackCardKey) {
    return function() {
      return setJSONValue(activeBlackCardKey, drawBlackCards(1)[0]);
    };
  }])
  .factory('submitCards', ['setJSONValue', 'localParticipantCards', 'whiteCards', function(setJSONValue, localParticipantCards, whiteCards) {
    var white;
    whiteCards().then(function(cards) {
      white = cards;
    });
    return function(cards) {
      var cardIds = [], i = 0, len = cards.length;

      for( ; i < len ; i++) {
        cardIds[i] = white.indexOf(cards[i]);
      }

      setJSONValue(localParticipantCards, cardIds);
    };
  }])
  .factory('watchForNewParticipants', [function() {
    return function(callback) {
      var func = function(evt) {
            callback(evt.enabledParticipants);
          },
          cancel = function() {
            gapi.hangout.onParticipantsEnabled.remove(func);
          };

      gapi.hangout.onParticipantsEnabled.add(func);
      return cancel;
    };
  }])
  .factory('watchForSubmittedCards', ['$filter', 'getJSONValue', 'submitDelta', 'listeningForSubmissionKey', 'whiteCards', function($filter, getJSONValue, submitDelta, listeningForSubmissionKey, whiteCards) {
    return function(callback) {
      var func = function(evt) {
            var newCards = $filter('filter')(evt.addedKeys, function(x) {
              return x.key.search('cards_') === 0;
            });
            whiteCards().then(function(white) {
              angular.forEach(newCards, function(obj) {
                obj.value = getJSONValue(obj.key);
                angular.forEach(obj.value, function(cardId, i) {
                  obj.value[i] = white[cardId];
                });
              });
              if(!!newCards.length) {
                callback(newCards);
              }
            });
          },
          cancel = function() {
            gapi.hangout.data.onStateChanged.remove(func);
            delta[listeningForSubmissionKey] = false;
            submitDelta(delta);
          },
          delta = {};

      delta[listeningForSubmissionKey] = true;
      submitDelta(delta);
      gapi.hangout.data.onStateChanged.add(func);

      return cancel;
    };
  }])
  .factory('sendCards', ['submitDelta', 'drawWhiteCards', function(submitDelta, drawWhiteCards) {
    return function(playerIds, cards) {
      var delta = {},
          remove = [],
          newCards = drawWhiteCards(playerIds.length * cards);

      angular.forEach(playerIds, function(p) {
        delta['new_' + p] = newCards.splice(0, cards);
        remove.push('cards_' + p);
      });

      submitDelta(delta, remove);
    };
  }])
  .factory('whiteCards', ['$http', '$q', function($http, $q) {
    var whiteCards,
        promise = $http.get('//hangouts-against-humanity.appspot.com/static/whitecards.json').then(function(response) {
          return (whiteCards = response.data);
        });
    return function() {
      if(!whiteCards) {
        return promise;
      } else {
        return $q.when(whiteCards);
      }
    };
  }])
  .factory('blackCards', ['$http', '$q', function($http, $q) {
    var blackCards,
        promise = $http.get('//hangouts-against-humanity.appspot.com/static/blackcards.json').then(function(response) {
          return (blackCards = response.data);
        });
    return function() {
      if(!blackCards) {
        return promise;
      } else {
        return $q.when(blackCards);
      }
    };
  }])
  .factory('transferToNextPlayer', ['submitDelta', 'currentReaderKey', 'activeBlackCardKey', 'localParticipantId', function(submitDelta, readerKey, activeBlackCardKey, myId) {
    return function() {
      var delta = {},
          participants = gapi.hangout.getEnabledParticipants().map(function(p) { return p.id; }).sort(),
          me = participants.indexOf(myId),
          next = (me + 1) % participants.length;

      delta[activeBlackCardKey] = '';
      delta[readerKey] = participants[next];

      submitDelta(delta);
    };
  }])
  .factory('selectWinner', ['submitDelta', 'getJSONValue', 'scoreboardKey', function(submitDelta, getJSONValue, scoreboardKey) {
    return function(participant) {
      var x = getJSONValue(scoreboardKey);

      x[participant] = x[participant]++;

      submitDelta(x);
    };
  }])
  .factory('playSound', [function() {
    return {
          yeah: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/yeah.wav').createSound(),
          boo: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/boo.wav').createSound(),
          cheer: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/cheer.wav').createSound(),
          ready: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/ready-here-we-go.wav').createSound(),
          timer: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/timer.wav').createSound(),
          sadtrombone: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/sadtrombone.wav').createSound(),
          rimshot: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/rimshot.wav').createSound()
        };
  }])
  .run(['submitDelta', 'shuffle', 'whiteCardKey', 'blackCardKey', 'currentReaderKey', 'scoreboardKey', 'localParticipantId', 'sendCards', 'whiteCards', 'blackCards', 'gameState', '$q', function(submitDelta, shuffle, whiteCardKey, blackCardKey, currentReaderKey, scoreboardKey, localParticipantId, sendCards, whiteCards, blackCards, gameState, $q) {

    function saveDeck(cardKey) {
      return function(cardIds) {
        var x = {};
        x[cardKey] = cardIds;
        submitDelta(x);
        return cardIds;
      };
    }

    function buildDeck(cards) {
      var c = [],
          i = 0, len = cards.length;

      for( ; i < len ; i++) {
        c[i] = i;
      }
      return shuffle(c);
    }

    function ifNotAlreadySaved(cardKey) {
      return function(cards) {
        if (angular.isUndefined(gapi.hangout.data.getValue(cardKey))) {
          return cards;
        } else {
          return $q.reject();
        }
      };
    }

    whiteCards()
      .then(ifNotAlreadySaved(whiteCardKey))
      .then(buildDeck)
      .then(saveDeck(whiteCardKey))
      .then(function pullMyCards(cardIds) {
        if(angular.isUndefined(gapi.hangout.data.getValue(currentReaderKey))) {
          var x = {};
          x[currentReaderKey] = localParticipantId;
          submitDelta(x);
          gapi.hangout.data.onStateChanged.add(function _temporaryName(evt) {
            if(evt.addedKeys.some(function(k) { return k.key === whiteCardKey; })) {
              sendCards([ localParticipantId ], 10);
              gapi.hangout.data.onStateChanged.remove(_temporaryName);
            }
          });
        }
        return cardIds;
      });

    blackCards()
      .then(ifNotAlreadySaved(blackCardKey))
      .then(buildDeck)
      .then(saveDeck(blackCardKey));


    var x = {};
    gameState.score[gapi.hangout.getLocalParticipant().person.displayName] = 0;
    x[scoreboardKey] = gameState.score;
    submitDelta(x);

  }])
  .factory('gameState', ['activeBlackCardKey', 'currentReaderKey', 'listeningForSubmissionKey', 'scoreboardKey', 'localParticipantNewCards', 'getJSONValue', 'whiteCards', 'blackCards', '$rootScope', function(activeBlackCardKey, currentReaderKey, listeningForSubmissionKey, scoreboardKey, localParticipantNewCards, getJSONValue, whiteCards, blackCards, $rootScope) {
    var item = {},
        white, black;

    whiteCards().then(function(cards) {
      var newCards = getJSONValue(localParticipantNewCards);
      item.newCards = [];
      if (angular.isArray(newCards)) {
        angular.forEach(newCards, function(cardId, i) {
          item.newCards[i] = cards[cardId];
        });
      }
      return cards;
    }).then(function(cards) {
      white = cards;
    });

    blackCards().then(function(cards) {
      var activeQuestion = getJSONValue(activeBlackCardKey);
      item.activeQuestion = cards[activeQuestion || ''];
      return cards;
    }).then(function(cards) {
      black = cards;
    });

    item.currentReader = getJSONValue(currentReaderKey);
    item.canSubmit = getJSONValue(listeningForSubmissionKey);
    item.score = getJSONValue(scoreboardKey) || {};

    gapi.hangout.data.onStateChanged.add(
      function(evt) {
        var questionChange,
            readerChange,
            canSubmit,
            newCards,
            score;

        questionChange = readerChange = canSubmit = newCards = score = false;

        angular.forEach(evt.addedKeys, function(v) {
          questionChange = (v.key === activeBlackCardKey ? true : questionChange);
          readerChange = (v.key === currentReaderKey ? true : readerChange);
          canSubmit = (v.key === listeningForSubmissionKey ? true : canSubmit);
          newCards = (v.key === localParticipantNewCards ? true : newCards);
          score = (v.key === scoreboardKey ? true : score);
        });

        if(questionChange || readerChange || canSubmit || newCards || score) {
          item.activeQuestion = (questionChange ? black[getJSONValue(activeBlackCardKey)] : item.activeQuestion);
          item.currentReader = (readerChange ? getJSONValue(currentReaderKey) : item.currentReader);
          item.canSubmit = (canSubmit ? getJSONValue(listeningForSubmissionKey) : item.canSubmit);
          item.score = (score ? getJSONValue(scoreboardKey) : item.score);
          if(newCards) {
            item.newCards = [];
            angular.forEach(getJSONValue(localParticipantNewCards), function(c, i) {
              item.newCards[i] = white[c];
            });
            gapi.hangout.data.clearValue(localParticipantNewCards);
          }
          $rootScope.$apply();
        }
      });

    return item;
  }])
  .controller('TableCtrl', ['$scope', '$sce', 'gameState', 'localParticipantId', 'submitCards', 'watchForSubmittedCards', 'drawNewQuestion', 'watchForNewParticipants', 'transferToNextPlayer', 'sendCards', 'playSound', 'selectWinner', function($scope, $sce, gameState, localParticipantId, submitCards, watchForSubmittedCards, drawNewQuestion, watchForNewParticipants, transferToNextPlayer, sendCards, playSound, selectWinner) {
    var cancelReader,
        cancelNewParticipantsWatch,
        blankCard = { text: 'Waiting for a Question...' };

    function ChangeOfActiveQuestion() {
      return gameState.activeQuestion;
    }

    function AmICurrentReader() {
      return gameState.currentReader === localParticipantId;
    }

    function CanSubmit() {
      return gameState.canSubmit;
    }

    function NewCardsDealt() {
      return gameState.newCards;
    }

    function ScoreChange() {
      return gameState.score;
    }

    $scope.hand = [];
    $scope.submittedCards = [];

    $scope.playSound = function(sound) {
      playSound[sound].play({loop: false, global: true});
    };

    $scope.selectCard = function(index) {
      if(!$scope.isReader) {
        $scope.submittedCards.push($scope.hand.splice(index, 1)[0]);
      }
    };

    $scope.unselectCard = function(index) {
      $scope.hand.push($scope.submittedCards.splice(index, 1)[0]);
    };

    $scope.disableSubmit = false;
    $scope.submitCards = function(cards) {
      submitCards(cards);
      $scope.submittedCards = [];
      $scope.disableSubmit = true;
    };

    $scope.isReader = false;

    $scope.$watch(ChangeOfActiveQuestion, function(newVal) {
      $scope.disableSubmit = !newVal;
      $scope.question = (!!newVal ? newVal : blankCard);
      $scope.question.text = $sce.trustAsHtml($scope.question.text);
    });

    $scope.$watch(AmICurrentReader, function(newVal) {
      $scope.isReader = newVal;
      if(newVal) {
        $scope.submittedPlayers = [];
        $scope.disableDrawQuestion = false;
        $scope.disableShowAnswers = true;
        $scope.disableMoveToNext = true;
        $scope.disableSelectWinner = true;

        cancelNewParticipantsWatch = watchForNewParticipants(function(participants) {
          sendCards(participants.map(function(p) { return p.id; }), 10);
        });
      }
    });

    $scope.$watch(CanSubmit, function(newVal) {
      $scope.disableSubmit = !newVal;
    });

    $scope.$watch(NewCardsDealt, function(newVal) {
      if(angular.isArray(newVal)) {
        $scope.hand = $scope.hand.concat(newVal);
      }
    });

    $scope.$watch(ScoreChange, function(newScore) {
      $scope.scoreboard = newScore;
    });

    /* Dealer-specific */
    $scope.moveToNext = function() {

      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = true;
      $scope.disableMoveToNext = true;
      $scope.disableSelectWinner = true;

      transferToNextPlayer();
      sendCards($scope.submittedPlayers.map(function(p) { return p.player; }), $scope.question.pick - $scope.question.draw );

      cancelNewParticipantsWatch();
    };

    $scope.showAnswers = function() {
      cancelReader();

      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = true;
      $scope.disableMoveToNext = true;
      $scope.disableSelectWinner = false;
    };

    $scope.selected = {};
    $scope.selectWinner = function() {
      selectWinner(gapi.hangout.getParticipantById($scope.selected.winner.player).person.displayName);
      $scope.selected = {};
      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = true;
      $scope.disableMoveToNext = false;
      $scope.disableSelectWinner = true;
    };

    $scope.drawNewQuestion = function() {
      var newQuestion = drawNewQuestion();
      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = false;
      $scope.disableMoveToNext = true;
      $scope.disableSelectWinner = true;

      $scope.submittedPlayers = [];
      if("0" !== newQuestion.draw) {
        sendCards(gapi.hangout.getEnabledParticipants().map(function(p) { return p.id; }), newQuestion.draw);
      }

      cancelReader = watchForSubmittedCards(function(newSubmissions) {
        angular.forEach(newSubmissions, function(submission) {
          $scope.submittedPlayers.push({
              player: submission.lastWriter,
              cards: submission.value
          });
        });
        if($scope.submittedPlayers.length === gapi.hangout.getEnabledParticipants().length - 1) {
          playSound.ready.play({loop: false, global: false});
        }
      });
    };
  }]);
